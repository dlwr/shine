import {setTimeout as sleep} from 'node:timers/promises';
import {hasJapaneseText} from '@shine/availability';
import {and, eq, sql} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {getScrapeDatabase} from './common/dry-run';
import {fetchJsonWithRetry} from './common/fetch-utilities';

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'shine-film.com movie database (https://shine-film.com)';
const DEFAULT_BATCH_SIZE = 50;

export type WikidataNameImportStats = {
  candidates: number;
  saved: number;
  replaced: number;
  notFound: number;
  failed: number;
};

type SparqlResponse = {
  results?: {
    bindings?: Array<{
      tmdb?: {value?: string};
      jaLabel?: {value?: string};
      article?: {value?: string};
    }>;
  };
};

export function buildSparqlQuery(tmdbIds: number[]): string {
  const values = tmdbIds
    .filter(id => Number.isSafeInteger(id) && id > 0)
    .map(id => `"${id}"`)
    .join(' ');

  return `SELECT ?tmdb ?jaLabel ?article WHERE {
  VALUES ?tmdb { ${values} }
  ?item wdt:P4985 ?tmdb.
  OPTIONAL {
    ?item rdfs:label ?jaLabel.
    FILTER(LANG(?jaLabel) = "ja")
  }
  OPTIONAL {
    ?article schema:about ?item;
      schema:isPartOf <https://ja.wikipedia.org/>.
  }
}`;
}

export function cleanPersonLabel(label: string): string {
  return label.replace(/\s*[（(][^（()）]*[）)]\s*$/, '').trim();
}

function articleTitleFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  const encoded = url.split('/wiki/').pop();
  if (!encoded) {
    return undefined;
  }

  try {
    return decodeURIComponent(encoded).replaceAll('_', ' ');
  } catch {
    return undefined;
  }
}

function usableName(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const cleaned = cleanPersonLabel(raw);
  return cleaned && hasJapaneseText(cleaned) ? cleaned : undefined;
}

export function parseSparqlResponse(
  response: SparqlResponse,
): Map<number, string> {
  const names = new Map<number, string>();
  const fromArticle = new Set<number>();

  const bindings = response.results?.bindings ?? [];
  for (const binding of bindings) {
    const tmdbId = Number(binding.tmdb?.value);
    if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
      continue;
    }

    if (fromArticle.has(tmdbId)) {
      continue;
    }

    const articleName = usableName(articleTitleFromUrl(binding.article?.value));
    if (articleName) {
      names.set(tmdbId, articleName);
      fromArticle.add(tmdbId);
      continue;
    }

    if (names.has(tmdbId)) {
      continue;
    }

    const labelName = usableName(binding.jaLabel?.value);
    if (labelName) {
      names.set(tmdbId, labelName);
    }
  }

  return names;
}

async function fetchBatch(tmdbIds: number[]): Promise<Map<number, string>> {
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(
    buildSparqlQuery(tmdbIds),
  )}`;

  const response = await fetchJsonWithRetry<SparqlResponse>(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/sparql-results+json',
    },
  });

  return parseSparqlResponse(response);
}

type Candidate = {
  uid: string;
  tmdbId: number;
  name: string;
  existingJa: string | undefined;
};

async function listCandidates(
  database: ReturnType<typeof getDatabase>,
): Promise<Candidate[]> {
  const rows = await database
    .select({
      uid: people.uid,
      tmdbId: people.tmdbId,
      name: people.name,
      existingJa: sql<string | null>`(
        SELECT content FROM translations
        WHERE translations.resource_uid = people.uid
          AND translations.resource_type = 'person_name'
          AND translations.language_code = 'ja'
        LIMIT 1
      )`.as('existingJa'),
      nominationCount: sql<number>`(
        SELECT count(*) FROM nominations
        WHERE nominations.person_uid = people.uid
      )`.as('nominationCount'),
      creditCount: sql<number>`(
        SELECT count(*) FROM movie_credits
        WHERE movie_credits.person_uid = people.uid
      )`.as('creditCount'),
    })
    .from(people);

  return rows
    .filter(
      row =>
        !hasJapaneseText(row.name) &&
        (row.existingJa === null || !hasJapaneseText(row.existingJa)),
    )
    .toSorted(
      (a, b) =>
        b.nominationCount - a.nominationCount ||
        b.creditCount - a.creditCount ||
        a.tmdbId - b.tmdbId,
    )
    .map(row => ({
      uid: row.uid,
      tmdbId: row.tmdbId,
      name: row.name,
      existingJa: row.existingJa ?? undefined,
    }));
}

export async function importJapaneseNamesFromWikidata({
  environment,
  dryRun = false,
  limit,
  batchSize = DEFAULT_BATCH_SIZE,
  throttleMs = 1000,
}: {
  environment: Environment;
  dryRun?: boolean;
  limit?: number;
  batchSize?: number;
  throttleMs?: number;
}): Promise<WikidataNameImportStats> {
  const stats: WikidataNameImportStats = {
    candidates: 0,
    saved: 0,
    replaced: 0,
    notFound: 0,
    failed: 0,
  };

  const database = getScrapeDatabase({environment, isDryRun: dryRun});
  const allCandidates = await listCandidates(database);
  const candidates =
    limit === undefined ? allCandidates : allCandidates.slice(0, limit);
  stats.candidates = candidates.length;

  if (candidates.length === 0) {
    console.log('No people need a Japanese name.');
    return stats;
  }

  const batches = Math.ceil(candidates.length / batchSize);
  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Looking up ${candidates.length} people on Wikidata (${batches} batches)...`,
  );

  for (let index = 0; index < candidates.length; index += batchSize) {
    const batch = candidates.slice(index, index + batchSize);
    const batchNumber = Math.floor(index / batchSize) + 1;

    let names: Map<number, string>;
    try {
      names = await fetchBatch(batch.map(candidate => candidate.tmdbId));
    } catch (error) {
      console.error(`  Batch ${batchNumber}/${batches} failed:`, error);
      stats.failed += batch.length;
      continue;
    }

    for (const candidate of batch) {
      await applyCandidateName({
        database,
        candidate,
        name: names.get(candidate.tmdbId),
        dryRun,
        stats,
      });
    }

    console.log(`  Batch ${batchNumber}/${batches} done`);

    if (throttleMs > 0 && index + batchSize < candidates.length) {
      await sleep(throttleMs);
    }
  }

  console.log('\nWikidata import summary:');
  console.log(`  Candidates: ${stats.candidates}`);
  console.log(`  Saved (new): ${stats.saved}`);
  console.log(`  Replaced (was romanized): ${stats.replaced}`);
  console.log(`  Not on Wikidata: ${stats.notFound}`);
  console.log(`  Failed: ${stats.failed}`);

  return stats;
}

async function applyCandidateName({
  database,
  candidate,
  name,
  dryRun,
  stats,
}: {
  database: ReturnType<typeof getDatabase>;
  candidate: Candidate;
  name: string | undefined;
  dryRun: boolean;
  stats: WikidataNameImportStats;
}): Promise<void> {
  if (!name) {
    stats.notFound++;
    return;
  }

  const isReplacement = candidate.existingJa !== undefined;
  console.log(
    `  ${candidate.name} (${candidate.tmdbId}): ${isReplacement ? `${candidate.existingJa} -> ` : ''}${name}`,
  );

  if (isReplacement) {
    stats.replaced++;
  } else {
    stats.saved++;
  }

  if (dryRun) {
    return;
  }

  await saveJapaneseName(database, candidate, name);
}

async function saveJapaneseName(
  database: ReturnType<typeof getDatabase>,
  candidate: Candidate,
  name: string,
): Promise<void> {
  if (candidate.existingJa === undefined) {
    await database
      .insert(translations)
      .values({
        resourceType: 'person_name',
        resourceUid: candidate.uid,
        languageCode: 'ja',
        content: name,
      })
      .onConflictDoNothing();
    return;
  }

  await database
    .update(translations)
    .set({content: name})
    .where(
      and(
        eq(translations.resourceUid, candidate.uid),
        eq(translations.resourceType, 'person_name'),
        eq(translations.languageCode, 'ja'),
      ),
    );
}
