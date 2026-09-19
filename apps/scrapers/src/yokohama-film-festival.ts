import {type Environment} from '@shine/database';
import {
  filmAwardReferences,
  importFilmAward,
  splitEditions,
  toFilmAwardEventData,
  type FilmAwardSource,
} from './common/ja-wikipedia-film-award';
import {type FilmReference} from './common/film-resolution-checks';
import {type ResolvedFilm} from './common/wikidata-film-resolver';
import {
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
} from './imdb-event-award';

export const BEST_TEN_CATEGORY = '日本映画ベストテン';
const RUNNER_UP_RANK = 11;

const EDITION_HEADING = /^====\s*第(\d+)回（(\d{4})年度）\s*====\s*$/m;
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

type YokohamaFilm = {
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
    const trimmed = line.trim();

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
  return splitEditions(wikitext, EDITION_HEADING).map(({year, body}) => ({
    year,
    bestTen: parseBestTen(body.replaceAll(REF_TAG, '')),
  }));
}

const source: FilmAwardSource<YokohamaEdition, YokohamaFilm> = {
  article: 'ヨコハマ映画祭',
  organizationName: 'Yokohama Film Festival',
  establishedYear: 1979,
  ceremonyNumber: yokohamaCeremonyNumber,
  categories: [
    {
      category: BEST_TEN_CATEGORY,
      films: edition => edition.bestTen,
      nomination: film => ({
        isWinner: film.rank === 1,
        notes: rankNote(film.rank),
      }),
    },
  ],
  /** 記事が無く、TMDbの邦題とも表記が合わない作品 */
  resolutionOverrides: new Map([
    ['1979:十代 恵子の場合', 'tt9679368'],
    ['1983:BLOW THE NIGHT! 夜をぶっとばせ', 'tt10071790'],
    ['1988:・ふ・た・り・ぼ・っ・ち・', 'tt0823626'],
    ['1988:SO WHAT', 'tt0183795'],
    ['1993:眠らない街〜新宿鮫〜', 'tt0256956'],
    ['1996:岸和田少年愚連隊 BOYS BE AMBITIOUS', 'tt0116780'],
    ['1998:犬、走る DOG RACE', 'tt0416863'],
    ['1999:avec mon mari アベックモンマリ', 'tt0204853'],
    ['2000:漂流街', 'tt0246498'],
    ['2000:NAGISA', 'tt0269600'],
    ['2002:OUT', 'tt0340280'],
    ['2007:魂萌え!', 'tt0906666'],
    // TMDbの邦題は「八日目の蟬」で字体が違い完全一致しない
    ['2011:八日目の蝉', 'tt1727825'],
    ['2011:その街のこども 劇場版', 'tt1803208'],
    ['2014:WOOD JOB! 〜神去なあなあ日常〜', 'tt2964120'],
    ['2020:海辺の映画館 キネマの玉手箱', 'tt10657812'],
    ['2020:本気のしるし〈劇場版〉', 'tt13276326'],
    // TMDbの公開日が2019年の映画祭プレミアなので年の窓から外れる
    ['2021:街の上で', 'tt11952444'],
  ]),
  useNotesAsSpecialMention: true,
  logUnresolved: true,
};

export function yokohamaFilmReferences(
  editions: YokohamaEdition[],
): FilmReference[] {
  return filmAwardReferences(source, editions);
}

export function toImdbEventData(
  editions: YokohamaEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt?: string,
): ImdbEventCollectedData {
  return toFilmAwardEventData(source, editions, resolved, collectedAt);
}

export async function importYokohamaFilmFestival(options: {
  environment: Environment;
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<Record<string, ImdbEventImportStats>> {
  return importFilmAward({source, parse: parseYokohamaWikitext, ...options});
}
