import {config} from 'dotenv';
import {and, eq, ne} from 'drizzle-orm';
import {
  checkDiscas,
  fetchJapaneseAlternativeTitles,
} from '../packages/availability/src/index.ts';
import {getDatabase} from '../packages/database/src/index.ts';
import {movieAvailabilityChecks} from '../packages/database/src/schema/movie-availability-checks.ts';

config({path: '.dev.vars'});

const requiredEnvironmentVariables = [
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
] as const;

for (const key of requiredEnvironmentVariables) {
  if (!process.env[key]) {
    throw new Error(
      `${key} is required. Please add it to .dev.vars or the environment.`,
    );
  }
}

const environment = {
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL!,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN!,
};

const tmdbApiKey = process.env.TMDB_API_KEY ?? '';
const waitMs = Number(process.env.WAIT_MS ?? 2000);
const limit = Number(process.env.LIMIT ?? 0);
const isApply = process.env.APPLY === '1';

const database = getDatabase(environment);
const client = database.$client;

const sleep = async (ms: number) =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

const targets = await client.execute(`
  WITH latest AS (
    SELECT movie_uid, status, detail,
           ROW_NUMBER() OVER (PARTITION BY movie_uid ORDER BY checked_at DESC) AS rn
    FROM movie_availability_checks WHERE source = 'discas'
  )
  SELECT m.uid, m.year, m.tmdb_id AS tmdbId
  FROM latest l
  JOIN movies m ON m.uid = l.movie_uid AND m.deleted_at IS NULL
  WHERE l.rn = 1
    AND l.status = 'ng'
    AND l.detail LIKE 'No match in %'
    AND l.detail <> 'No match in 0 results'
  ORDER BY m.uid
`);

const rows = limit > 0 ? targets.rows.slice(0, limit) : targets.rows;
console.log(`targets: ${rows.length} (apply=${isApply})`);

let flipped = 0;
let index = 0;
for (const row of rows) {
  index++;
  const movieUid = String(row.uid);
  const year = row.year === null ? undefined : Number(row.year);
  const tmdbId = row.tmdbId === null ? undefined : Number(row.tmdbId);

  const titleRows = await client.execute({
    sql: `SELECT language_code, content FROM translations
          WHERE resource_uid = ? AND resource_type = 'movie_title'`,
    args: [movieUid],
  });
  const japanese = titleRows.rows.filter(r => r.language_code === 'ja');
  const others = titleRows.rows.filter(r => r.language_code !== 'ja');
  const titles = [...japanese, ...others]
    .map(r => String(r.content))
    .filter(title => title.trim() !== '');
  if (titles.length === 0) {
    continue;
  }

  const alternativeTitles = tmdbId
    ? await fetchJapaneseAlternativeTitles(tmdbId, tmdbApiKey)
    : [];

  await sleep(waitMs);
  const result = await checkDiscas(
    [...new Set([...titles, ...alternativeTitles])],
    fetch,
    {year},
  );
  if (result.status !== 'ok') {
    if (result.status === 'error') {
      console.log(
        `[${index}/${rows.length}] ${titles[0]} -> error: ${result.detail}`,
      );
    }

    continue;
  }

  flipped++;
  console.log(
    `[${index}/${rows.length}] FLIP ${titles[0]} (${year ?? '?'}) -> ${result.detail}`,
  );

  if (!isApply) {
    continue;
  }

  await database
    .delete(movieAvailabilityChecks)
    .where(
      and(
        eq(movieAvailabilityChecks.movieUid, movieUid),
        eq(movieAvailabilityChecks.source, 'discas'),
        ne(movieAvailabilityChecks.status, 'ok'),
      ),
    );
  await database.insert(movieAvailabilityChecks).values({
    movieUid,
    source: 'discas',
    status: 'ok',
    detail: result.detail,
    checkedAt: Math.floor(Date.now() / 1000),
  });
}

console.log(`done. flipped=${flipped}/${rows.length}`);
