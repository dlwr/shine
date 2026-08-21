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
const WIKIPEDIA_ARTICLE = 'ブルーリボン賞 (映画)';
const SOURCE_URL = 'https://ja.wikipedia.org/wiki/ブルーリボン賞_(映画)';
const USER_AGENT = 'shine-film.com movie database (https://shine-film.com)';

export const BEST_FILM_CATEGORY = '作品賞';
export const FOREIGN_CATEGORY = '外国作品賞';

// 第2回のみ海外映画賞という名称だった。外国作品賞に統一して取り込む
const FOREIGN_NAMES = new Set(['海外映画賞', FOREIGN_CATEGORY]);

const EDITION_HEADING =
  /^====\s*(?:\[\[[^\]|]+\|)?第(\d+)回（(\d{4})年度）(?:]])?\s*====\s*$/m;
const HIGHER_HEADING = /^={2,3}[^=]/m;
const AWARD_LINE = /^\*(?!\*)\s*([^『\s]+)\s*(.*)$/;
// 出典のタイトルに『映画名』が入ることがある
const REF_TAG = /<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>/g;
const BRACKETED_TITLE = /『([^』]*)』/g;
const WIKI_LINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;

export type BlueRibbonFilm = {
  page?: string;
  title: string;
};

export type BlueRibbonEdition = {
  year: number;
  bestFilm: BlueRibbonFilm[];
  foreign: BlueRibbonFilm[];
};

// 第1回（1950年度）〜第17回（1966年度）、1967〜1974年度は休止、第18回（1975年度）から再開
export function blueRibbonCeremonyNumber(year: number): number | undefined {
  if (year >= 1950 && year <= 1966) {
    return year - 1949;
  }

  if (year >= 1975) {
    return year - 1957;
  }

  return undefined;
}

function parseFilms(text: string): BlueRibbonFilm[] {
  const films: BlueRibbonFilm[] = [];

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

function parseEditionBody(year: number, body: string): BlueRibbonEdition {
  const edition: BlueRibbonEdition = {
    year,
    bestFilm: [],
    foreign: [],
  };

  for (const line of body.split('\n')) {
    const matched = AWARD_LINE.exec(line.replaceAll(REF_TAG, '').trim());
    if (!matched) {
      continue;
    }

    const [, name, rest] = matched;
    if (name === BEST_FILM_CATEGORY) {
      edition.bestFilm.push(...parseFilms(rest));
    } else if (FOREIGN_NAMES.has(name)) {
      edition.foreign.push(...parseFilms(rest));
    }
  }

  return edition;
}

export function parseBlueRibbonWikitext(wikitext: string): BlueRibbonEdition[] {
  const parts = wikitext.split(new RegExp(EDITION_HEADING.source, 'gm'));
  const editions: BlueRibbonEdition[] = [];

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
export function filmKey(film: BlueRibbonFilm): string {
  return film.page ?? `title:${film.title}`;
}

/** 連作の共有記事や前後編分割で自動同定できない作品 */
const RESOLUTION_OVERRIDES = new Map([
  // 記事がシリーズ全体（ジュラシックパーク）で映画単体に解決できない
  ['1993:ジュラシックパーク', 'tt0107290'],
]);

function overrideImdbId(
  year: number,
  film: BlueRibbonFilm,
): string | undefined {
  return RESOLUTION_OVERRIDES.get(`${year}:${film.title}`);
}

/** 日本映画は選考年度＝公開年。年末公開が翌年扱いになることはある */
const JAPANESE_PUBLICATION_WINDOW: YearWindow = {min: -1, max: 1};

/** 外国映画は本国公開の後に日本公開されるので選考年度より前になる */
const FOREIGN_PUBLICATION_WINDOW: YearWindow = {
  min: -Infinity,
  max: 1,
};

export function blueRibbonFilmReferences(
  editions: BlueRibbonEdition[],
): FilmReference[] {
  return editions.flatMap(edition => [
    ...edition.bestFilm
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
  films: BlueRibbonFilm[],
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
      isWinner: true,
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
  editions: BlueRibbonEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt = new Date().toISOString().slice(0, 10),
): ImdbEventCollectedData {
  return {
    collectedAt,
    source: SOURCE_URL,
    editions: editions
      .map(edition => ({
        year: edition.year,
        awardNames: [BEST_FILM_CATEGORY, FOREIGN_CATEGORY],
        targetAward: [
          {
            categories: [
              {
                category: BEST_FILM_CATEGORY,
                total: null, // eslint-disable-line unicorn/no-null -- ImdbEventCollectedDataの型に合わせる
                nominations: buildNominations(
                  edition.year,
                  edition.bestFilm,
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

const baseConfig = {
  organizationName: 'Blue Ribbon Awards',
  organizationCountry: 'Japan',
  establishedYear: 1950,
  ceremonyNumber: blueRibbonCeremonyNumber,
  minimumFilmsPerEdition: 1,
};

export const blueRibbonBestFilmConfig: ImdbEventAwardConfig = {
  ...baseConfig,
  categoryName: BEST_FILM_CATEGORY,
  isCompetitionCategory: category => category === BEST_FILM_CATEGORY,
};

export const blueRibbonForeignConfig: ImdbEventAwardConfig = {
  ...baseConfig,
  categoryName: FOREIGN_CATEGORY,
  isCompetitionCategory: category => category === FOREIGN_CATEGORY,
};

export async function fetchBlueRibbonWikitext(): Promise<string> {
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
    throw new Error('Failed to fetch ブルーリボン賞 wikitext');
  }

  return wikitext;
}

function collectJapaneseTitles(
  editions: BlueRibbonEdition[],
  resolved: Map<string, ResolvedFilm>,
): Map<string, string> {
  const titleByImdbId = new Map<string, string>();

  const films = editions.flatMap(edition =>
    [...edition.bestFilm, ...edition.foreign].map(film => ({
      year: edition.year,
      film,
    })),
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

export async function importBlueRibbonAwards({
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
  bestFilm: ImdbEventImportStats;
  foreign: ImdbEventImportStats;
}> {
  const wikitext = await fetchBlueRibbonWikitext();
  const allEditions = parseBlueRibbonWikitext(wikitext);
  const editions =
    year === undefined
      ? allEditions
      : allEditions.filter(edition => edition.year === year);

  console.log(`Parsed ${editions.length} editions from Wikipedia`);

  const pages = [
    ...new Set(
      editions
        .flatMap(edition => [...edition.bestFilm, ...edition.foreign])
        .map(film => film.page)
        .filter((page): page is string => page !== undefined),
    ),
  ];

  console.log(`Resolving IMDb IDs for ${pages.length} articles...`);
  const resolved = await resolveFilmsByWikipediaPage(pages);
  console.log(`Resolved ${resolved.size}/${pages.length} articles`);

  const references = blueRibbonFilmReferences(editions);
  const misattributed = await dropMisattributedResolutions({
    references,
    resolved,
    tmdbApiKey: environment.TMDB_API_KEY,
    throttleMs,
  });
  if (misattributed > 0) {
    console.log(`Dropped ${misattributed} misattributed resolutions`);
  }

  // 同じ映画が複数の年度に選ばれることは無いので、重複はリメイクなどへの誤解決
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

  const bestFilm = await importImdbEventAward({
    environment,
    data,
    config: blueRibbonBestFilmConfig,
    dryRun,
    year,
    throttleMs,
  });

  const foreign = await importImdbEventAward({
    environment,
    data,
    config: blueRibbonForeignConfig,
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

  return {bestFilm, foreign};
}
