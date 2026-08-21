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
const WIKIPEDIA_ARTICLE = '日刊スポーツ映画大賞・石原裕次郎賞';
const SOURCE_URL =
  'https://ja.wikipedia.org/wiki/日刊スポーツ映画大賞・石原裕次郎賞';
const USER_AGENT = 'shine-film.com movie database (https://shine-film.com)';

export const BEST_FILM_CATEGORY = '作品賞';
export const FOREIGN_CATEGORY = '外国作品賞';
export const YUJIRO_CATEGORY = '石原裕次郎賞';

const EDITION_HEADING =
  /^====\s*(?:\[\[[^\]|]+\|)?第(\d+)回（(\d{4})年度）(?:]])?\s*====\s*$/m;
const HIGHER_HEADING = /^={2,3}[^=]/m;
const AWARD_LINE = /^\*(?!\*)\s*([^『\s]+)\s*(.*)$/;
// 出典のタイトルに『映画名』が入ることがある
const REF_TAG = /<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>/g;
const TEMPLATE = /{{[^}]*}}/g;
const BRACKETED_TITLE = /『([^』]*)』/g;
const WIKI_LINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;

export type NikkanSportsFilm = {
  page?: string;
  title: string;
};

export type NikkanSportsEdition = {
  year: number;
  bestFilm: NikkanSportsFilm[];
  foreign: NikkanSportsFilm[];
  yujiro: NikkanSportsFilm[];
};

// 第1回（1988年度）から毎年開催で欠年なし
export function nikkanSportsCeremonyNumber(year: number): number | undefined {
  return year >= 1988 ? year - 1987 : undefined;
}

function parseFilm(content: string): NikkanSportsFilm {
  const link = WIKI_LINK.exec(content);
  if (link) {
    const page = link[1].trim();
    return {page, title: (link[2] ?? page).trim()};
  }

  return {title: content.replaceAll(TEMPLATE, '').trim()};
}

function parseFilms(text: string): NikkanSportsFilm[] {
  const films: NikkanSportsFilm[] = [];

  for (const [, inner] of text.matchAll(BRACKETED_TITLE)) {
    const content = inner.trim();
    if (content === '') {
      continue;
    }

    films.push(parseFilm(content));
  }

  if (films.length === 0 && WIKI_LINK.test(text)) {
    films.push(parseFilm(text));
  }

  return films;
}

function parseEditionBody(year: number, body: string): NikkanSportsEdition {
  const edition: NikkanSportsEdition = {
    year,
    bestFilm: [],
    foreign: [],
    yujiro: [],
  };

  const targets: Record<string, NikkanSportsFilm[]> = {
    [BEST_FILM_CATEGORY]: edition.bestFilm,
    [FOREIGN_CATEGORY]: edition.foreign,
    [YUJIRO_CATEGORY]: edition.yujiro,
  };

  for (const line of body.split('\n')) {
    const matched = AWARD_LINE.exec(line.replaceAll(REF_TAG, '').trim());
    if (!matched) {
      continue;
    }

    const [, name, rest] = matched;
    targets[name]?.push(...parseFilms(rest));
  }

  return edition;
}

export function parseNikkanSportsWikitext(
  wikitext: string,
): NikkanSportsEdition[] {
  const parts = wikitext.split(new RegExp(EDITION_HEADING.source, 'gm'));
  const editions: NikkanSportsEdition[] = [];

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
export function filmKey(film: NikkanSportsFilm): string {
  return film.page ?? `title:${film.title}`;
}

/** 連作の共有記事や表記揺れで自動同定できない作品 */
const RESOLUTION_OVERRIDES = new Map([
  ['1993:学校', 'tt0202364'],
  ['1996:学校II', 'tt0116386'],
  ['2000:十五才 学校IV', 'tt0338679'],
  // TMDbの邦題は「男たちの大和／YAMATO」で全角スラッシュ
  ['2006:男たちの大和/YAMATO', 'tt0451845'],
  // 1998・2012・2019年版が同じ邦題を持つ。受賞は2012年版
  ['2013:レ・ミゼラブル', 'tt1707386'],
  // TMDbの邦題は「少年Ｈ」で全角のH
  ['2013:少年H', 'tt2299531'],
  // 京都大火編・伝説の最期編の2部作への授与。京都大火編を代表に
  ['2014:るろうに剣心', 'tt3029558'],
  // 前篇・後篇の同時受賞。前篇を代表として指す
  ['2015:ソロモンの偽証', 'tt3421614'],
  // 前編・後編の2部作への授与。前編を代表に
  ['2016:64 -ロクヨン-', 'tt4471630'],
]);

function overrideImdbId(
  year: number,
  film: NikkanSportsFilm,
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

function toReference(
  edition: NikkanSportsEdition,
  film: NikkanSportsFilm,
  isForeign: boolean,
): FilmReference {
  return {
    key: filmKey(film),
    title: film.title,
    targetYear: edition.year,
    yearWindow: isForeign
      ? FOREIGN_PUBLICATION_WINDOW
      : JAPANESE_PUBLICATION_WINDOW,
    foreign: isForeign,
  };
}

export function nikkanSportsFilmReferences(
  editions: NikkanSportsEdition[],
): FilmReference[] {
  return editions.flatMap(edition =>
    [
      ...edition.bestFilm.map(film => ({film, isForeign: false})),
      ...edition.yujiro.map(film => ({film, isForeign: false})),
      ...edition.foreign.map(film => ({film, isForeign: true})),
    ]
      .filter(({film}) => overrideImdbId(edition.year, film) === undefined)
      .map(({film, isForeign}) => toReference(edition, film, isForeign)),
  );
}

function buildNominations(
  year: number,
  films: NikkanSportsFilm[],
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
  editions: NikkanSportsEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt = new Date().toISOString().slice(0, 10),
): ImdbEventCollectedData {
  return {
    collectedAt,
    source: SOURCE_URL,
    editions: editions
      .map(edition => ({
        year: edition.year,
        awardNames: [BEST_FILM_CATEGORY, FOREIGN_CATEGORY, YUJIRO_CATEGORY],
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
              {
                category: YUJIRO_CATEGORY,
                total: null, // eslint-disable-line unicorn/no-null -- ImdbEventCollectedDataの型に合わせる
                nominations: buildNominations(
                  edition.year,
                  edition.yujiro,
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
  organizationName: 'Nikkan Sports Film Awards',
  organizationCountry: 'Japan',
  establishedYear: 1988,
  ceremonyNumber: nikkanSportsCeremonyNumber,
  minimumFilmsPerEdition: 1,
};

export const nikkanSportsBestFilmConfig: ImdbEventAwardConfig = {
  ...baseConfig,
  categoryName: BEST_FILM_CATEGORY,
  isCompetitionCategory: category => category === BEST_FILM_CATEGORY,
};

export const nikkanSportsForeignConfig: ImdbEventAwardConfig = {
  ...baseConfig,
  categoryName: FOREIGN_CATEGORY,
  isCompetitionCategory: category => category === FOREIGN_CATEGORY,
};

export const nikkanSportsYujiroConfig: ImdbEventAwardConfig = {
  ...baseConfig,
  categoryName: YUJIRO_CATEGORY,
  isCompetitionCategory: category => category === YUJIRO_CATEGORY,
};

export async function fetchNikkanSportsWikitext(): Promise<string> {
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
    throw new Error('Failed to fetch 日刊スポーツ映画大賞 wikitext');
  }

  return wikitext;
}

function collectJapaneseTitles(
  editions: NikkanSportsEdition[],
  resolved: Map<string, ResolvedFilm>,
): Map<string, string> {
  const titleByImdbId = new Map<string, string>();

  const films = editions.flatMap(edition =>
    [...edition.bestFilm, ...edition.foreign, ...edition.yujiro].map(film => ({
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

export async function importNikkanSportsFilmAwards({
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
  yujiro: ImdbEventImportStats;
}> {
  const wikitext = await fetchNikkanSportsWikitext();
  const allEditions = parseNikkanSportsWikitext(wikitext);
  const editions =
    year === undefined
      ? allEditions
      : allEditions.filter(edition => edition.year === year);

  console.log(`Parsed ${editions.length} editions from Wikipedia`);

  const pages = [
    ...new Set(
      editions
        .flatMap(edition => [
          ...edition.bestFilm,
          ...edition.foreign,
          ...edition.yujiro,
        ])
        .map(film => film.page)
        .filter((page): page is string => page !== undefined),
    ),
  ];

  console.log(`Resolving IMDb IDs for ${pages.length} articles...`);
  const resolved = await resolveFilmsByWikipediaPage(pages);
  console.log(`Resolved ${resolved.size}/${pages.length} articles`);

  const references = nikkanSportsFilmReferences(editions);
  const misattributed = await dropMisattributedResolutions({
    references,
    resolved,
    tmdbApiKey: environment.TMDB_API_KEY,
    throttleMs,
  });
  if (misattributed > 0) {
    console.log(`Dropped ${misattributed} misattributed resolutions`);
  }

  // 同じ映画が複数の年度・部門に選ばれることは無いので、重複はリメイクなどへの誤解決
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
    config: nikkanSportsBestFilmConfig,
    dryRun,
    year,
    throttleMs,
  });

  const foreign = await importImdbEventAward({
    environment,
    data,
    config: nikkanSportsForeignConfig,
    dryRun,
    year,
    throttleMs,
  });

  const yujiro = await importImdbEventAward({
    environment,
    data,
    config: nikkanSportsYujiroConfig,
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

  return {bestFilm, foreign, yujiro};
}
