import {hasJapaneseText} from '@shine/availability';
import {type Environment} from '@shine/database';
import {buildUrl, fetchJsonWithRetry} from './common/fetch-utilities';
import {backfillJapaneseTitlesByImdbId} from './common/japanese-title-backfill';
import {resolveRemainingByTmdb} from './common/tmdb-film-resolver';
import {
  dropMisattributedResolutions,
  reportDuplicateResolutions,
  resolveFilmsByWikipediaPage,
  type FilmReference,
  type ResolvedFilm,
  type YearWindow,
} from './common/wikidata-film-resolver';
import {
  importImdbEventAward,
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
  type ImdbEventNomination,
} from './imdb-event-award';

const WIKIPEDIA_API = 'https://ja.wikipedia.org/w/api.php';
const WIKIPEDIA_ARTICLE = 'キネマ旬報';
const SOURCE_URL = 'https://ja.wikipedia.org/wiki/キネマ旬報';
const USER_AGENT = 'shine-film.com movie database (https://shine-film.com)';

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
    if (entry === '' || EMPTY_RANK.has(entry)) {
      continue;
    }

    films.push(...parseEntry(rank, entry));
  }

  return films;
}

function parseEntry(rank: number, entry: string): KinemaJunpoFilm[] {
  const films: KinemaJunpoFilm[] = [];

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

  return films;
}

export function parseKinemaJunpoWikitext(
  wikitext: string,
): KinemaJunpoEdition[] {
  const parts = wikitext.split(new RegExp(EDITION_HEADING.source, 'gm'));
  const editions: KinemaJunpoEdition[] = [];

  for (let index = 1; index < parts.length; index += 3) {
    const year = Number(parts[index + 1]);
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

/** 連作の共有記事や、ja.wikipedia の記事が Wikidata の映画実体に繋がらない作品 */
const RESOLUTION_OVERRIDES = new Map([
  ['1925:嘆きのピエロ', 'tt0014256'],
  ['1927:忠次旅日記 信州血笑篇', 'tt0432794'],
  ['1927:忠次旅日記 御用篇', 'tt0342196'],
  ['1927:ボー・ジェスト', 'tt0016634'],
  ['1927:チャング', 'tt0017743'],
  ['1927:帝国ホテル', 'tt0018014'],
  ['1927:椿姫', 'tt0017731'],
  ['1927:カルメン', 'tt0016709'],
  ['1935:最後の億万長者', 'tt0025043'],
  ['1935:ロスチャイルド', 'tt0025272'],
  ['1935:生きているモレア', 'tt0026970'],
  ['1935:情熱なき犯罪', 'tt0025009'],
]);

function overrideImdbId(
  year: number,
  film: KinemaJunpoFilm,
): string | undefined {
  return RESOLUTION_OVERRIDES.get(`${year}:${film.title}`);
}

/** 日本映画は年度＝公開年。映画祭プレミアで前年、年始公開で翌年になることはある */
const JAPANESE_PUBLICATION_WINDOW: YearWindow = {min: -1, max: 1};

/** 外国映画は本国公開の後に日本公開されるので年度より前になる */
const FOREIGN_PUBLICATION_WINDOW: YearWindow = {
  min: -Infinity,
  max: 1,
};

export function kinemaJunpoFilmReferences(
  editions: KinemaJunpoEdition[],
): FilmReference[] {
  return editions.flatMap(edition => [
    ...edition.japanese
      .filter(film => overrideImdbId(edition.year, film) === undefined)
      .map(film => ({
        key: filmKey(film),
        title: film.title,
        targetYear: edition.year,
        yearWindow: JAPANESE_PUBLICATION_WINDOW,
        foreign: false,
      })),
    ...edition.foreign
      .filter(film => overrideImdbId(edition.year, film) === undefined)
      .map(film => ({
        key: filmKey(film),
        title: film.title,
        targetYear: edition.year,
        yearWindow: FOREIGN_PUBLICATION_WINDOW,
        foreign: true,
      })),
  ]);
}

function buildNominations(
  year: number,
  films: KinemaJunpoFilm[],
  resolved: Map<string, ResolvedFilm>,
): ImdbEventNomination[] {
  const nominations: ImdbEventNomination[] = [];
  const seen = new Set<string>();

  for (const film of films) {
    const imdbId = overrideImdbId(year, film);
    const match: ResolvedFilm | undefined =
      imdbId === undefined ? resolved.get(filmKey(film)) : {imdbId};
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
                nominations: buildNominations(
                  edition.year,
                  edition.japanese,
                  resolved,
                ),
              },
              {
                category: FOREIGN_CATEGORY,
                total: null, // eslint-disable-line unicorn/no-null -- ImdbEventCollectedDataの型に合わせる
                nominations: buildNominations(
                  edition.year,
                  edition.foreign,
                  resolved,
                ),
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

function collectJapaneseTitles(
  edition: KinemaJunpoEdition,
  resolved: Map<string, ResolvedFilm>,
  titleByImdbId: Map<string, string>,
): void {
  for (const film of [...edition.japanese, ...edition.foreign]) {
    const imdbId =
      overrideImdbId(edition.year, film) ?? resolved.get(filmKey(film))?.imdbId;
    if (imdbId === undefined || !hasJapaneseText(film.title)) {
      continue;
    }

    if (!titleByImdbId.has(imdbId)) {
      titleByImdbId.set(imdbId, film.title);
    }
  }
}

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
    collectJapaneseTitles(edition, resolved, titleByImdbId);
  }

  return backfillJapaneseTitlesByImdbId(environment, titleByImdbId);
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

  const references = kinemaJunpoFilmReferences(editions);
  const dropped = await dropMisattributedResolutions({
    references,
    resolved,
    tmdbApiKey: environment.TMDB_API_KEY,
    throttleMs,
  });
  if (dropped > 0) {
    console.log(`Dropped ${dropped} misattributed resolutions`);
  }

  reportDuplicateResolutions(references, resolved);

  await resolveRemainingByTmdb({
    references,
    resolved,
    tmdbApiKey: environment.TMDB_API_KEY,
    throttleMs,
  });

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
