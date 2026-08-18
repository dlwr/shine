import {setTimeout as sleep} from 'node:timers/promises';
import {hasJapaneseText} from '@shine/availability';
import {and, eq, inArray, isNull} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {buildUrl, fetchJsonWithRetry} from './common/fetch-utilities';
import {fetchTMDBMovieDetails} from './common/tmdb-utilities';
import {
  importImdbEventAward,
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
  type ImdbEventNomination,
} from './imdb-event-award';

const TMDB_API = 'https://api.themoviedb.org/3';
const IMDB_ID_PATTERN = /^tt\d+$/;
const WIKIPEDIA_API = 'https://ja.wikipedia.org/w/api.php';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_ARTICLE = 'キネマ旬報';
const SOURCE_URL = 'https://ja.wikipedia.org/wiki/キネマ旬報';
const USER_AGENT = 'shine-film.com movie database (https://shine-film.com)';
const BATCH_SIZE = 50;

export const JAPANESE_CATEGORY = 'Best Japanese Film';
export const FOREIGN_CATEGORY = 'Best Foreign Film';

const JAPANESE_SECTIONS = new Set([
  '日本映画ベスト・テン',
  '日本映画',
  '日本・現代映画',
  '日本・時代映画',
]);

const FOREIGN_SECTIONS = new Set([
  '外国映画ベスト・テン',
  '外国映画',
  '外国・発声映画',
  '外国・無声映画',
  '芸術的に最も優れた映画',
  '娯楽的に最も優れた映画',
  '芸術的優秀映画',
  '娯楽的優秀映画',
]);

const EDITION_HEADING = /^====\s*第(\d+)回（(\d{4})年度）\s*====$/m;
const SECTION_HEADING = /^'''(.+?)'''\s*$/m;
const HIGHER_HEADING = /^={2,3}[^=]/m;
const WIKI_LINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;
const LINE_BREAK = /<br\s*\/?>/;
const EMPTY_RANK = new Set(['-', '－', '―']);

export type KinemaJunpoFilm = {
  rank: number;
  page?: string;
  title: string;
};

export type KinemaJunpoEdition = {
  year: number;
  japanese: KinemaJunpoFilm[];
  foreign: KinemaJunpoFilm[];
};

export type ResolvedFilm = {
  imdbId: string;
  englishTitle?: string;
};

// 1924年度から毎年。戦争で1943〜1945年度は中止され、1946年度の第20回で再開した
export function kinemaJunpoCeremonyNumber(year: number): number | undefined {
  if (year < 1924 || (year >= 1943 && year <= 1945)) {
    return undefined;
  }

  return year - (year <= 1942 ? 1923 : 1926);
}

function parseFilmLines(content: string): KinemaJunpoFilm[] {
  const films: KinemaJunpoFilm[] = [];
  let rank = 0;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#')) {
      continue;
    }

    rank++;
    const entry = trimmed.slice(1).trim();
    if (EMPTY_RANK.has(entry) || entry === '') {
      continue;
    }

    for (const fragment of entry.split(LINE_BREAK)) {
      const text = fragment.trim();
      if (text === '') {
        continue;
      }

      const link = WIKI_LINK.exec(text);
      if (link) {
        const page = link[1].trim();
        films.push({rank, page, title: (link[2] ?? page).trim()});
        continue;
      }

      const title = text.replace(/（.*$/, '').trim();
      if (title !== '') {
        films.push({rank, title});
      }
    }
  }

  return films;
}

export function parseKinemaJunpoWikitext(
  wikitext: string,
): KinemaJunpoEdition[] {
  const parts = wikitext.split(new RegExp(EDITION_HEADING.source, 'gm'));
  const editions: KinemaJunpoEdition[] = [];

  for (let index = 1; index < parts.length; index += 3) {
    const year = Number.parseInt(parts[index + 1], 10);
    const body = parts[index + 2].split(
      new RegExp(HIGHER_HEADING.source, 'm'),
    )[0];
    const blocks = body.split(new RegExp(SECTION_HEADING.source, 'gm'));
    const edition: KinemaJunpoEdition = {year, japanese: [], foreign: []};

    for (let block = 1; block < blocks.length; block += 2) {
      const heading = blocks[block];
      const films = parseFilmLines(blocks[block + 1]);

      if (JAPANESE_SECTIONS.has(heading)) {
        edition.japanese.push(...films);
      } else if (FOREIGN_SECTIONS.has(heading)) {
        edition.foreign.push(...films);
      }
    }

    editions.push(edition);
  }

  return editions;
}

/** 記事が無い作品はWikipediaの表示名で引けるようにする */
export function filmKey(film: KinemaJunpoFilm): string {
  return film.page ?? `title:${film.title}`;
}

function buildNominations(
  films: KinemaJunpoFilm[],
  resolved: Map<string, ResolvedFilm>,
): ImdbEventNomination[] {
  const nominations: ImdbEventNomination[] = [];
  const seen = new Set<string>();

  for (const film of films) {
    const match = resolved.get(filmKey(film));
    if (!match || seen.has(match.imdbId)) {
      continue;
    }

    seen.add(match.imdbId);
    nominations.push({
      isWinner: film.rank === 1,
      notes: `${film.rank}位`,
      titles: [
        {
          imdbId: match.imdbId,
          title: film.title,
          originalTitle: match.englishTitle ?? null, // eslint-disable-line unicorn/no-null -- ImdbEventNominationTitleの型に合わせる
        },
      ],
    });
  }

  return nominations;
}

export function toImdbEventData(
  editions: KinemaJunpoEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt = new Date().toISOString().slice(0, 10),
): ImdbEventCollectedData {
  return {
    collectedAt,
    source: SOURCE_URL,
    editions: editions
      .map(edition => ({
        year: edition.year,
        awardNames: [JAPANESE_CATEGORY, FOREIGN_CATEGORY],
        targetAward: [
          {
            categories: [
              {
                category: JAPANESE_CATEGORY,
                total: null, // eslint-disable-line unicorn/no-null -- ImdbEventCollectedDataの型に合わせる
                nominations: buildNominations(edition.japanese, resolved),
              },
              {
                category: FOREIGN_CATEGORY,
                total: null, // eslint-disable-line unicorn/no-null -- ImdbEventCollectedDataの型に合わせる
                nominations: buildNominations(edition.foreign, resolved),
              },
            ],
          },
        ],
      }))
      .filter(edition =>
        edition.targetAward[0].categories.some(
          category => category.nominations.length > 0,
        ),
      ),
  };
}

export const kinemaJunpoJapaneseConfig: ImdbEventAwardConfig = {
  organizationName: 'Kinema Junpo',
  organizationCountry: 'Japan',
  establishedYear: 1924,
  categoryName: JAPANESE_CATEGORY,
  ceremonyNumber: kinemaJunpoCeremonyNumber,
  isCompetitionCategory: category => category === JAPANESE_CATEGORY,
  minimumFilmsPerEdition: 1,
  useNotesAsSpecialMention: true,
};

export const kinemaJunpoForeignConfig: ImdbEventAwardConfig = {
  ...kinemaJunpoJapaneseConfig,
  categoryName: FOREIGN_CATEGORY,
  isCompetitionCategory: category => category === FOREIGN_CATEGORY,
};

type WikipediaPagePropertiesResponse = {
  query?: {
    normalized?: Array<{from: string; to: string}>;
    redirects?: Array<{from: string; to: string}>;
    pages?: Record<
      string,
      {title?: string; pageprops?: {wikibase_item?: string}}
    >;
  };
};

type WikidataEntitiesResponse = {
  entities?: Record<
    string,
    {
      claims?: Record<
        string,
        Array<{mainsnak?: {datavalue?: {value?: unknown}}}>
      >;
      labels?: Record<string, {value?: string}>;
    }
  >;
};

export async function fetchKinemaJunpoWikitext(): Promise<string> {
  const url = buildUrl(WIKIPEDIA_API, {
    action: 'parse',
    page: WIKIPEDIA_ARTICLE,
    prop: 'wikitext',
    format: 'json',
    formatversion: '2',
  });

  const response = await fetchJsonWithRetry<{parse?: {wikitext?: string}}>(
    url,
    {headers: {'User-Agent': USER_AGENT}},
  );

  const wikitext = response.parse?.wikitext;
  if (!wikitext) {
    throw new Error('Failed to fetch キネマ旬報 wikitext');
  }

  return wikitext;
}

async function fetchWikibaseItems(
  pages: string[],
): Promise<Map<string, string>> {
  const url = buildUrl(WIKIPEDIA_API, {
    action: 'query',
    prop: 'pageprops',
    ppprop: 'wikibase_item',
    redirects: '1',
    format: 'json',
    titles: pages.join('|'),
  });

  const response = await fetchJsonWithRetry<WikipediaPagePropertiesResponse>(
    url,
    {
      headers: {'User-Agent': USER_AGENT},
    },
  );

  const normalized = new Map(
    (response.query?.normalized ?? []).map(entry => [entry.from, entry.to]),
  );
  const redirects = new Map(
    (response.query?.redirects ?? []).map(entry => [entry.from, entry.to]),
  );
  const byTitle = new Map(
    Object.values(response.query?.pages ?? {}).map(page => [page.title, page]),
  );

  const items = new Map<string, string>();
  for (const page of pages) {
    const title = normalized.get(page) ?? page;
    const resolvedTitle = redirects.get(title) ?? title;
    const item = byTitle.get(resolvedTitle)?.pageprops?.wikibase_item;
    if (item) {
      items.set(page, item);
    }
  }

  return items;
}

async function fetchImdbIds(
  itemIds: string[],
): Promise<Map<string, ResolvedFilm>> {
  const url = buildUrl(WIKIDATA_API, {
    action: 'wbgetentities',
    props: 'claims|labels',
    languages: 'en',
    format: 'json',
    ids: itemIds.join('|'),
  });

  const response = await fetchJsonWithRetry<WikidataEntitiesResponse>(url, {
    headers: {'User-Agent': USER_AGENT},
  });

  const films = new Map<string, ResolvedFilm>();
  const entityEntries = Object.entries(response.entities ?? {});
  for (const [itemId, entity] of entityEntries) {
    const imdbId = entity.claims?.P345?.[0]?.mainsnak?.datavalue?.value;
    if (typeof imdbId !== 'string' || !/^tt\d+$/.test(imdbId)) {
      continue;
    }

    films.set(itemId, {imdbId, englishTitle: entity.labels?.en?.value});
  }

  return films;
}

export async function resolveFilmsByWikipediaPage(
  pages: string[],
): Promise<Map<string, ResolvedFilm>> {
  const itemsByPage = new Map<string, string>();
  for (let index = 0; index < pages.length; index += BATCH_SIZE) {
    const batch = pages.slice(index, index + BATCH_SIZE);
    const wikibaseItems = await fetchWikibaseItems(batch);
    for (const [page, item] of wikibaseItems) {
      itemsByPage.set(page, item);
    }

    console.log(
      `  Wikipedia: ${Math.min(index + BATCH_SIZE, pages.length)}/${pages.length}`,
    );
  }

  const itemIds = [...new Set(itemsByPage.values())];
  const filmsByItem = new Map<string, ResolvedFilm>();
  for (let index = 0; index < itemIds.length; index += BATCH_SIZE) {
    const batch = itemIds.slice(index, index + BATCH_SIZE);
    const imdbIds = await fetchImdbIds(batch);
    for (const [item, film] of imdbIds) {
      filmsByItem.set(item, film);
    }

    console.log(
      `  Wikidata: ${Math.min(index + BATCH_SIZE, itemIds.length)}/${itemIds.length}`,
    );
  }

  const resolved = new Map<string, ResolvedFilm>();
  for (const [page, item] of itemsByPage) {
    const film = filmsByItem.get(item);
    if (film) {
      resolved.set(page, film);
    }
  }

  return resolved;
}

export type TmdbSearchResult = {
  id: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  original_language?: string;
};

function normalizeTitle(value: string | undefined): string {
  return (value ?? '').replaceAll(/[\s\u{3000}]/gu, '').toLowerCase();
}

/** 外国映画は本国公開から日本公開までのずれがあるので過去側に幅を持たせる */
const FOREIGN_YEAR_WINDOW = 15;

/** 同名のリメイクが多いので、絞り込んだ結果が1件のときだけ採用する */
export function selectTmdbMatch(
  results: TmdbSearchResult[],
  title: string,
  year: number,
  {foreign = false}: {foreign?: boolean} = {},
): TmdbSearchResult | undefined {
  const normalized = normalizeTitle(title);
  const matches = results.filter(result => {
    const isJapanese = result.original_language === 'ja';
    if (foreign === isJapanese) {
      return false;
    }

    const releaseYear = Number.parseInt(
      result.release_date?.slice(0, 4) ?? '',
      10,
    );
    if (!Number.isFinite(releaseYear)) {
      return false;
    }

    const earliest = year - (foreign ? FOREIGN_YEAR_WINDOW : 1);
    if (releaseYear < earliest || releaseYear > year + 1) {
      return false;
    }

    return (
      normalizeTitle(result.title) === normalized ||
      normalizeTitle(result.original_title) === normalized
    );
  });

  return matches.length === 1 ? matches[0] : undefined;
}

async function searchTmdbByJapaneseTitle(
  title: string,
  tmdbApiKey: string,
): Promise<TmdbSearchResult[]> {
  const url = buildUrl(`${TMDB_API}/search/movie`, {
    api_key: tmdbApiKey,
    query: title,
    language: 'ja-JP',
    include_adult: 'false',
  });

  const response = await fetchJsonWithRetry<{results?: TmdbSearchResult[]}>(
    url,
  );

  return response.results ?? [];
}

export async function resolveFilmsByTmdb(
  entries: Array<{key: string; title: string; year: number; foreign: boolean}>,
  tmdbApiKey: string,
  throttleMs: number,
): Promise<Map<string, ResolvedFilm>> {
  const resolved = new Map<string, ResolvedFilm>();

  for (const entry of entries) {
    try {
      const results = await searchTmdbByJapaneseTitle(entry.title, tmdbApiKey);
      const match = selectTmdbMatch(results, entry.title, entry.year, {
        foreign: entry.foreign,
      });
      if (match) {
        const details = await fetchTMDBMovieDetails(match.id, tmdbApiKey);
        const imdbId = details?.imdb_id;
        if (imdbId && IMDB_ID_PATTERN.test(imdbId)) {
          resolved.set(entry.key, {imdbId, englishTitle: details?.title});
          console.log(
            `  TMDb fallback: ${entry.title} (${entry.year}) -> ${imdbId} (TMDb ${match.id})`,
          );
        }
      }
    } catch (error) {
      console.error(`  TMDb fallback failed for ${entry.title}:`, error);
    }

    if (throttleMs > 0) {
      await sleep(throttleMs);
    }
  }

  return resolved;
}

/** Wikipediaの表記は邦題として信頼できるので、TMDb由来の原題を上書きする */
export async function backfillJapaneseTitles({
  environment,
  editions,
  resolved,
}: {
  environment: Environment;
  editions: KinemaJunpoEdition[];
  resolved: Map<string, ResolvedFilm>;
}): Promise<{saved: number; replaced: number}> {
  const titleByImdbId = new Map<string, string>();
  for (const edition of editions) {
    for (const film of [...edition.japanese, ...edition.foreign]) {
      const match = resolved.get(filmKey(film));
      if (!match || !hasJapaneseText(film.title)) {
        continue;
      }

      if (!titleByImdbId.has(match.imdbId)) {
        titleByImdbId.set(match.imdbId, film.title);
      }
    }
  }

  const database = getDatabase(environment);
  const stats = {saved: 0, replaced: 0};
  const imdbIds = [...titleByImdbId.keys()];

  for (let index = 0; index < imdbIds.length; index += BATCH_SIZE) {
    const batch = imdbIds.slice(index, index + BATCH_SIZE);
    const rows = await database
      .select({uid: movies.uid, imdbId: movies.imdbId})
      .from(movies)
      .where(and(inArray(movies.imdbId, batch), isNull(movies.deletedAt)));

    for (const row of rows) {
      const title = row.imdbId ? titleByImdbId.get(row.imdbId) : undefined;
      if (!title) {
        continue;
      }

      const [existing] = await database
        .select({uid: translations.uid, content: translations.content})
        .from(translations)
        .where(
          and(
            eq(translations.resourceUid, row.uid),
            eq(translations.resourceType, 'movie_title'),
            eq(translations.languageCode, 'ja'),
          ),
        )
        .limit(1);

      if (existing === undefined) {
        await database.insert(translations).values({
          resourceType: 'movie_title',
          resourceUid: row.uid,
          languageCode: 'ja',
          content: title,
          isDefault: 0,
        });
        stats.saved++;
        continue;
      }

      if (!hasJapaneseText(existing.content)) {
        await database
          .update(translations)
          .set({content: title})
          .where(eq(translations.uid, existing.uid));
        stats.replaced++;
      }
    }
  }

  return stats;
}

export async function importKinemaJunpo({
  environment,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<{japanese: ImdbEventImportStats; foreign: ImdbEventImportStats}> {
  const wikitext = await fetchKinemaJunpoWikitext();
  const allEditions = parseKinemaJunpoWikitext(wikitext);
  const editions =
    year === undefined
      ? allEditions
      : allEditions.filter(edition => edition.year === year);

  console.log(`Parsed ${editions.length} editions from Wikipedia`);

  const pages = [
    ...new Set(
      editions
        .flatMap(edition => [...edition.japanese, ...edition.foreign])
        .map(film => film.page)
        .filter((page): page is string => page !== undefined),
    ),
  ];

  console.log(`Resolving IMDb IDs for ${pages.length} articles...`);
  const resolved = await resolveFilmsByWikipediaPage(pages);
  console.log(`Resolved ${resolved.size}/${pages.length} articles`);

  if (environment.TMDB_API_KEY) {
    const pending = new Map(
      editions.flatMap(edition =>
        [
          ...edition.japanese.map(film => ({film, foreign: false})),
          ...edition.foreign.map(film => ({film, foreign: true})),
        ]
          .filter(({film}) => !resolved.has(filmKey(film)))
          .map(({film, foreign}) => [
            filmKey(film),
            {
              key: filmKey(film),
              title: film.title,
              year: edition.year,
              foreign,
            },
          ]),
      ),
    );

    console.log(`TMDb fallback for ${pending.size} films...`);
    const fallback = await resolveFilmsByTmdb(
      [...pending.values()],
      environment.TMDB_API_KEY,
      throttleMs,
    );

    for (const [key, film] of fallback) {
      resolved.set(key, film);
    }

    console.log(`TMDb fallback resolved ${fallback.size}/${pending.size}`);
  }

  const data = toImdbEventData(editions, resolved);

  const japanese = await importImdbEventAward({
    environment,
    data,
    config: kinemaJunpoJapaneseConfig,
    dryRun,
    year,
    throttleMs,
  });

  const foreign = await importImdbEventAward({
    environment,
    data,
    config: kinemaJunpoForeignConfig,
    dryRun,
    year,
    throttleMs,
  });

  if (!dryRun) {
    const titles = await backfillJapaneseTitles({
      environment,
      editions,
      resolved,
    });
    console.log(
      `\nJapanese titles: ${titles.saved} saved, ${titles.replaced} replaced`,
    );
  }

  return {japanese, foreign};
}
