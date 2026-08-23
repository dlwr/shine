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
const WIKIPEDIA_ARTICLE = 'ヨコハマ映画祭';
const SOURCE_URL = 'https://ja.wikipedia.org/wiki/ヨコハマ映画祭';
const USER_AGENT = 'shine-film.com movie database (https://shine-film.com)';

export const BEST_TEN_CATEGORY = '日本映画ベストテン';
export const RUNNER_UP_RANK = 11;

const EDITION_HEADING = /^====\s*第(\d+)回（(\d{4})年度）\s*====\s*$/m;
const HIGHER_HEADING = /^={2,3}[^=]/m;
// 2018年度までは太字見出し、2019年度以降は定義リスト
const BEST_TEN_HEADING =
  /^(?:'''|;)\s*\d{4}年度日本映画ベストテン\s*(?:''')?\s*$/;
const RANK_LINE = /^:?#\s*(.*)$/;
const LINE_BREAK = /<br\s*\/?>/;
const REF_TAG = /<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>/g;
const WIKI_LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;
const LEADING_WIKI_LINK = new RegExp(`^${WIKI_LINK.source}`);
const DIRECTOR_SUFFIX = /[（(].*$/;
const QUOTED_LINK = new RegExp(String.raw`『\s*${WIKI_LINK.source}`, 'g');

export type YokohamaFilm = {
  rank: number;
  page?: string;
  title: string;
};

export type YokohamaEdition = {
  year: number;
  bestTen: YokohamaFilm[];
};

// 第1回（1979年度）から毎年開催で欠年なし。2020・2021年度は授賞式のみ中止
export function yokohamaCeremonyNumber(year: number): number | undefined {
  return year >= 1979 ? year - 1978 : undefined;
}

export function rankNote(rank: number): string {
  return rank >= RUNNER_UP_RANK ? '次点' : `${rank}位`;
}

function linkToFilm(rank: number, link: RegExpExecArray): YokohamaFilm {
  const page = link[1].trim();
  return {rank, page, title: (link[2] ?? page).trim()};
}

// 記事は既出の映画を再リンクしないので、同じ回の『』内リンクから記事名を補う
function collectTitlePages(body: string): Map<string, string> {
  const pages = new Map<string, string>();

  for (const link of body.matchAll(QUOTED_LINK)) {
    const page = link[1].trim();
    const title = (link[2] ?? page).trim();
    if (!pages.has(title)) {
      pages.set(title, page);
    }
  }

  return pages;
}

function parseFragment(
  rank: number,
  fragment: string,
  titlePages: Map<string, string>,
): YokohamaFilm | undefined {
  const text = fragment.trim();
  if (text === '') {
    return undefined;
  }

  const leading = LEADING_WIKI_LINK.exec(text);
  if (leading) {
    return linkToFilm(rank, leading);
  }

  const head = text.replace(DIRECTOR_SUFFIX, '').trim();
  const link = WIKI_LINK.exec(head);
  if (link) {
    return linkToFilm(rank, link);
  }

  if (head === '') {
    return undefined;
  }

  const page = titlePages.get(head);
  return page === undefined ? {rank, title: head} : {rank, page, title: head};
}

function parseBestTen(body: string): YokohamaFilm[] {
  const titlePages = collectTitlePages(body);
  const films: YokohamaFilm[] = [];
  let isInBlock = false;
  let rank = 0;

  for (const line of body.split('\n')) {
    const trimmed = line.replaceAll(REF_TAG, '').trim();

    if (!isInBlock) {
      isInBlock = BEST_TEN_HEADING.test(trimmed);
      continue;
    }

    const matched = RANK_LINE.exec(trimmed);
    if (!matched) {
      break;
    }

    rank++;
    const fragments = matched[1].split(LINE_BREAK);
    for (const fragment of fragments) {
      const film = parseFragment(rank, fragment, titlePages);
      if (film) {
        films.push(film);
      }
    }
  }

  return films;
}

export function parseYokohamaWikitext(wikitext: string): YokohamaEdition[] {
  const parts = wikitext.split(new RegExp(EDITION_HEADING.source, 'gm'));
  const editions: YokohamaEdition[] = [];

  for (let index = 1; index < parts.length; index += 3) {
    const year = Number(parts[index + 1]);
    const body = parts[index + 2]
      .replaceAll(REF_TAG, '')
      .split(new RegExp(HIGHER_HEADING.source, 'm'))[0];
    editions.push({year, bestTen: parseBestTen(body)});
  }

  return editions;
}

/** 記事が無い作品はWikipediaの表示名で引けるようにする */
export function filmKey(film: YokohamaFilm): string {
  return film.page ?? `title:${film.title}`;
}

/** 共有記事や表記揺れで自動同定できない作品 */
const RESOLUTION_OVERRIDES = new Map<string, string>();

function overrideImdbId(year: number, film: YokohamaFilm): string | undefined {
  return RESOLUTION_OVERRIDES.get(`${year}:${film.title}`);
}

/** 日本映画は選考年度＝公開年。年末公開が翌年扱いになることはある */
const PUBLICATION_WINDOW: YearWindow = {min: -1, max: 1};

export function yokohamaFilmReferences(
  editions: YokohamaEdition[],
): FilmReference[] {
  return editions.flatMap(edition =>
    edition.bestTen
      .filter(film => overrideImdbId(edition.year, film) === undefined)
      .map(film => ({
        key: filmKey(film),
        title: film.title,
        targetYear: edition.year,
        yearWindow: PUBLICATION_WINDOW,
        foreign: false,
      })),
  );
}

function buildNominations(
  year: number,
  films: YokohamaFilm[],
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
      notes: rankNote(film.rank),
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
  editions: YokohamaEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt = new Date().toISOString().slice(0, 10),
): ImdbEventCollectedData {
  return {
    collectedAt,
    source: SOURCE_URL,
    editions: editions
      .map(edition => ({
        year: edition.year,
        awardNames: [BEST_TEN_CATEGORY],
        targetAward: [
          {
            categories: [
              {
                category: BEST_TEN_CATEGORY,
                total: null, // eslint-disable-line unicorn/no-null -- ImdbEventCollectedDataの型に合わせる
                nominations: buildNominations(
                  edition.year,
                  edition.bestTen,
                  resolved,
                ),
              },
            ],
          },
        ],
      }))
      .filter(
        edition => edition.targetAward[0].categories[0].nominations.length > 0,
      ),
  };
}

export const yokohamaBestTenConfig: ImdbEventAwardConfig = {
  organizationName: 'Yokohama Film Festival',
  organizationCountry: 'Japan',
  establishedYear: 1979,
  categoryName: BEST_TEN_CATEGORY,
  ceremonyNumber: yokohamaCeremonyNumber,
  isCompetitionCategory: category => category === BEST_TEN_CATEGORY,
  minimumFilmsPerEdition: 1,
  useNotesAsSpecialMention: true,
};

export async function fetchYokohamaWikitext(): Promise<string> {
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
    throw new Error('Failed to fetch ヨコハマ映画祭 wikitext');
  }

  return wikitext;
}

function collectJapaneseTitles(
  editions: YokohamaEdition[],
  resolved: Map<string, ResolvedFilm>,
): Map<string, string> {
  const titleByImdbId = new Map<string, string>();

  for (const edition of editions) {
    for (const film of edition.bestTen) {
      const imdbId =
        overrideImdbId(edition.year, film) ??
        resolved.get(filmKey(film))?.imdbId;
      if (
        imdbId !== undefined &&
        hasJapaneseText(film.title) &&
        !titleByImdbId.has(imdbId)
      ) {
        titleByImdbId.set(imdbId, film.title);
      }
    }
  }

  return titleByImdbId;
}

export async function importYokohamaFilmFestival({
  environment,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  const wikitext = await fetchYokohamaWikitext();
  const allEditions = parseYokohamaWikitext(wikitext);
  const editions =
    year === undefined
      ? allEditions
      : allEditions.filter(edition => edition.year === year);

  console.log(`Parsed ${editions.length} editions from Wikipedia`);

  const pages = [
    ...new Set(
      editions
        .flatMap(edition => edition.bestTen)
        .map(film => film.page)
        .filter((page): page is string => page !== undefined),
    ),
  ];

  console.log(`Resolving IMDb IDs for ${pages.length} articles...`);
  const resolved = await resolveFilmsByWikipediaPage(pages);
  console.log(`Resolved ${resolved.size}/${pages.length} articles`);

  const references = yokohamaFilmReferences(editions);
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

  for (const reference of references) {
    if (!resolved.has(reference.key)) {
      console.log(`  Unresolved: ${reference.targetYear} ${reference.title}`);
    }
  }

  const data = toImdbEventData(editions, resolved);

  const stats = await importImdbEventAward({
    environment,
    data,
    config: yokohamaBestTenConfig,
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

  return stats;
}
