import {hasJapaneseText} from '@shine/availability';
import {type Environment} from '@shine/database';
import {buildUrl, fetchJsonWithRetry} from './common/fetch-utilities';
import {backfillJapaneseTitlesByImdbId} from './common/japanese-title-backfill';
import {resolveRemainingByTmdb} from './common/tmdb-film-resolver';
import {
  dropDuplicateResolutions,
  dropMisattributedResolutions,
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
const WIKIPEDIA_ARTICLE = '毎日映画コンクール';
const SOURCE_URL = 'https://ja.wikipedia.org/wiki/毎日映画コンクール';
const USER_AGENT = 'shine-film.com movie database (https://shine-film.com)';

export const GRAND_PRIX_CATEGORY = '日本映画大賞';
export const EXCELLENCE_CATEGORY = '日本映画優秀賞';
export const FOREIGN_CATEGORY = '外国映画ベストワン賞';

// 第30回までの名称は日本映画賞。日本映画大賞に統一して取り込む
const GRAND_PRIX_NAMES = new Set(['日本映画賞', GRAND_PRIX_CATEGORY]);

const EDITION_HEADING =
  /^====\s*(?:\[\[[^\]|]+\|)?第(\d+)回（(\d{4})年）(?:]])?\s*====\s*$/m;
const HIGHER_HEADING = /^={2,3}[^=]/m;
const AWARD_LINE = /^:\*\*\s*(\S+)\s*(.*)$/;
const BRACKETED_TITLE = /『([^』]*)』/g;
const WIKI_LINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;

export type MainichiFilm = {
  page?: string;
  title: string;
};

export type MainichiEdition = {
  year: number;
  grandPrix: MainichiFilm[];
  excellence: MainichiFilm[];
  foreign: MainichiFilm[];
};

// 第1回（1946年）から毎年、中断なし
export function mainichiCeremonyNumber(year: number): number | undefined {
  return year < 1946 ? undefined : year - 1945;
}

function parseFilms(text: string): MainichiFilm[] {
  const films: MainichiFilm[] = [];

  for (const [, inner] of text.matchAll(BRACKETED_TITLE)) {
    const content = inner.trim();
    if (content === '') {
      continue;
    }

    const link = WIKI_LINK.exec(content);
    if (link) {
      const page = link[1].trim();
      films.push({page, title: (link[2] ?? page).trim()});
      continue;
    }

    films.push({title: content});
  }

  return films;
}

function parseEditionBody(year: number, body: string): MainichiEdition {
  const edition: MainichiEdition = {
    year,
    grandPrix: [],
    excellence: [],
    foreign: [],
  };
  let isPendingExcellence = false;

  for (const line of body.split('\n')) {
    const trimmed = line.trim();

    if (trimmed.startsWith(':***')) {
      if (isPendingExcellence) {
        edition.excellence.push(...parseFilms(trimmed));
      }
      continue;
    }

    isPendingExcellence = false;
    const matched = AWARD_LINE.exec(trimmed);
    if (!matched) {
      continue;
    }

    const [, name, rest] = matched;
    if (GRAND_PRIX_NAMES.has(name)) {
      edition.grandPrix.push(...parseFilms(rest));
    } else if (name === EXCELLENCE_CATEGORY) {
      edition.excellence.push(...parseFilms(rest));
      isPendingExcellence = true;
    } else if (name === FOREIGN_CATEGORY) {
      edition.foreign.push(...parseFilms(rest));
    }
  }

  return edition;
}

export function parseMainichiWikitext(wikitext: string): MainichiEdition[] {
  const parts = wikitext.split(new RegExp(EDITION_HEADING.source, 'gm'));
  const editions: MainichiEdition[] = [];

  for (let index = 1; index < parts.length; index += 3) {
    const year = Number(parts[index + 1]);
    const body = parts[index + 2].split(
      new RegExp(HIGHER_HEADING.source, 'm'),
    )[0];
    editions.push(parseEditionBody(year, body));
  }

  return editions;
}

/** 記事が無い作品はWikipediaの表示名で引けるようにする */
export function filmKey(film: MainichiFilm): string {
  return film.page ?? `title:${film.title}`;
}

/** 連作の共有記事や前後編分割で自動同定できない作品 */
const RESOLUTION_OVERRIDES = new Map([
  ['1961:人間の條件', 'tt0055233'],
  ['1993:学校', 'tt0202364'],
  ['1996:学校II', 'tt0116386'],
  ['1998:学校III', 'tt0245127'],
  ['2000:十五才 学校IV', 'tt0338679'],
  ['2020:アンダードッグ', 'tt14051616'],
]);

function overrideImdbId(year: number, film: MainichiFilm): string | undefined {
  return RESOLUTION_OVERRIDES.get(`${year}:${film.title}`);
}

/** 日本映画は選考年＝公開年。年末公開が翌年扱いになることはある */
const JAPANESE_PUBLICATION_WINDOW: YearWindow = {min: -1, max: 1};

/** 外国映画は本国公開の後に日本公開されるので選考年より前になる */
const FOREIGN_PUBLICATION_WINDOW: YearWindow = {
  min: -Infinity,
  max: 1,
};

export function mainichiFilmReferences(
  editions: MainichiEdition[],
): FilmReference[] {
  return editions.flatMap(edition => [
    ...[...edition.grandPrix, ...edition.excellence]
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
  films: MainichiFilm[],
  resolved: Map<string, ResolvedFilm>,
  isWinner: boolean,
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
      isWinner,
      notes: null, // eslint-disable-line unicorn/no-null -- ImdbEventNominationの型に合わせる
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
  editions: MainichiEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt = new Date().toISOString().slice(0, 10),
): ImdbEventCollectedData {
  return {
    collectedAt,
    source: SOURCE_URL,
    editions: editions
      .map(edition => ({
        year: edition.year,
        awardNames: [
          GRAND_PRIX_CATEGORY,
          EXCELLENCE_CATEGORY,
          FOREIGN_CATEGORY,
        ],
        targetAward: [
          {
            categories: [
              {
                category: GRAND_PRIX_CATEGORY,
                total: null, // eslint-disable-line unicorn/no-null -- ImdbEventCollectedDataの型に合わせる
                nominations: buildNominations(
                  edition.year,
                  edition.grandPrix,
                  resolved,
                  true,
                ),
              },
              {
                category: EXCELLENCE_CATEGORY,
                total: null, // eslint-disable-line unicorn/no-null -- ImdbEventCollectedDataの型に合わせる
                nominations: buildNominations(
                  edition.year,
                  edition.excellence,
                  resolved,
                  false,
                ),
              },
              {
                category: FOREIGN_CATEGORY,
                total: null, // eslint-disable-line unicorn/no-null -- ImdbEventCollectedDataの型に合わせる
                nominations: buildNominations(
                  edition.year,
                  edition.foreign,
                  resolved,
                  true,
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

const baseConfig = {
  organizationName: 'Mainichi Film Awards',
  organizationCountry: 'Japan',
  establishedYear: 1946,
  ceremonyNumber: mainichiCeremonyNumber,
  minimumFilmsPerEdition: 1,
};

export const mainichiGrandPrixConfig: ImdbEventAwardConfig = {
  ...baseConfig,
  categoryName: GRAND_PRIX_CATEGORY,
  isCompetitionCategory: category => category === GRAND_PRIX_CATEGORY,
};

export const mainichiExcellenceConfig: ImdbEventAwardConfig = {
  ...baseConfig,
  categoryName: EXCELLENCE_CATEGORY,
  isCompetitionCategory: category => category === EXCELLENCE_CATEGORY,
};

export const mainichiForeignConfig: ImdbEventAwardConfig = {
  ...baseConfig,
  categoryName: FOREIGN_CATEGORY,
  isCompetitionCategory: category => category === FOREIGN_CATEGORY,
};

export async function fetchMainichiWikitext(): Promise<string> {
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
    throw new Error('Failed to fetch 毎日映画コンクール wikitext');
  }

  return wikitext;
}

function collectJapaneseTitles(
  editions: MainichiEdition[],
  resolved: Map<string, ResolvedFilm>,
): Map<string, string> {
  const titleByImdbId = new Map<string, string>();

  const films = editions.flatMap(edition =>
    [...edition.grandPrix, ...edition.excellence, ...edition.foreign].map(
      film => ({year: edition.year, film}),
    ),
  );

  for (const {year, film} of films) {
    const imdbId =
      overrideImdbId(year, film) ?? resolved.get(filmKey(film))?.imdbId;
    if (
      imdbId !== undefined &&
      hasJapaneseText(film.title) &&
      !titleByImdbId.has(imdbId)
    ) {
      titleByImdbId.set(imdbId, film.title);
    }
  }

  return titleByImdbId;
}

export async function importMainichiFilmConcours({
  environment,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<{
  grandPrix: ImdbEventImportStats;
  excellence: ImdbEventImportStats;
  foreign: ImdbEventImportStats;
}> {
  const wikitext = await fetchMainichiWikitext();
  const allEditions = parseMainichiWikitext(wikitext);
  const editions =
    year === undefined
      ? allEditions
      : allEditions.filter(edition => edition.year === year);

  console.log(`Parsed ${editions.length} editions from Wikipedia`);

  const pages = [
    ...new Set(
      editions
        .flatMap(edition => [
          ...edition.grandPrix,
          ...edition.excellence,
          ...edition.foreign,
        ])
        .map(film => film.page)
        .filter((page): page is string => page !== undefined),
    ),
  ];

  console.log(`Resolving IMDb IDs for ${pages.length} articles...`);
  const resolved = await resolveFilmsByWikipediaPage(pages);
  console.log(`Resolved ${resolved.size}/${pages.length} articles`);

  const references = mainichiFilmReferences(editions);
  const misattributed = await dropMisattributedResolutions({
    references,
    resolved,
    tmdbApiKey: environment.TMDB_API_KEY,
    throttleMs,
  });
  if (misattributed > 0) {
    console.log(`Dropped ${misattributed} misattributed resolutions`);
  }

  // 同じ映画が複数の年に選ばれることは無いので、重複はリメイクなどへの誤解決
  const duplicates = dropDuplicateResolutions(references, resolved);
  if (duplicates > 0) {
    console.log(`Dropped ${duplicates} duplicate resolutions`);
  }

  await resolveRemainingByTmdb({
    references,
    resolved,
    tmdbApiKey: environment.TMDB_API_KEY,
    throttleMs,
  });

  dropDuplicateResolutions(references, resolved);

  const data = toImdbEventData(editions, resolved);

  const grandPrix = await importImdbEventAward({
    environment,
    data,
    config: mainichiGrandPrixConfig,
    dryRun,
    year,
    throttleMs,
  });

  const excellence = await importImdbEventAward({
    environment,
    data,
    config: mainichiExcellenceConfig,
    dryRun,
    year,
    throttleMs,
  });

  const foreign = await importImdbEventAward({
    environment,
    data,
    config: mainichiForeignConfig,
    dryRun,
    year,
    throttleMs,
  });

  if (!dryRun) {
    const titles = await backfillJapaneseTitlesByImdbId(
      environment,
      collectJapaneseTitles(editions, resolved),
    );
    console.log(
      `\nJapanese titles: ${titles.saved} saved, ${titles.replaced} replaced`,
    );
  }

  return {grandPrix, excellence, foreign};
}
