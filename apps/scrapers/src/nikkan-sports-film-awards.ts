import {type Environment} from '@shine/database';
import {
  collectAwardLineFilms,
  filmAwardReferences,
  importFilmAward,
  splitEditions,
  toFilmAwardEventData,
  type FilmAwardSource,
  type WikiFilm,
} from './common/ja-wikipedia-film-award';
import {type FilmReference} from './common/film-resolution-checks';
import {type ResolvedFilm} from './common/wikidata-film-resolver';
import {
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
} from './imdb-event-award';

export const BEST_FILM_CATEGORY = '作品賞';
export const FOREIGN_CATEGORY = '外国作品賞';
export const YUJIRO_CATEGORY = '石原裕次郎賞';

const EDITION_HEADING =
  /^====\s*(?:\[\[[^\]|]+\|)?第(\d+)回（(\d{4})年度）(?:]])?\s*====\s*$/m;

export type NikkanSportsEdition = {
  year: number;
  bestFilm: WikiFilm[];
  foreign: WikiFilm[];
  yujiro: WikiFilm[];
};

// 第1回（1988年度）から毎年開催で欠年なし
export function nikkanSportsCeremonyNumber(year: number): number | undefined {
  return year >= 1988 ? year - 1987 : undefined;
}

export function parseNikkanSportsWikitext(
  wikitext: string,
): NikkanSportsEdition[] {
  return splitEditions(wikitext, EDITION_HEADING).map(({year, body}) => {
    const edition: NikkanSportsEdition = {
      year,
      bestFilm: [],
      foreign: [],
      yujiro: [],
    };
    const targets: Record<string, WikiFilm[]> = {
      [BEST_FILM_CATEGORY]: edition.bestFilm,
      [FOREIGN_CATEGORY]: edition.foreign,
      [YUJIRO_CATEGORY]: edition.yujiro,
    };
    collectAwardLineFilms(body, name => targets[name]);
    return edition;
  });
}

const source: FilmAwardSource<NikkanSportsEdition> = {
  article: '日刊スポーツ映画大賞・石原裕次郎賞',
  organizationName: 'Nikkan Sports Film Awards',
  establishedYear: 1988,
  ceremonyNumber: nikkanSportsCeremonyNumber,
  categories: [
    {category: BEST_FILM_CATEGORY, films: edition => edition.bestFilm},
    {
      category: FOREIGN_CATEGORY,
      films: edition => edition.foreign,
      foreign: true,
    },
    {category: YUJIRO_CATEGORY, films: edition => edition.yujiro},
  ],
  /** 連作の共有記事や表記揺れで自動同定できない作品 */
  resolutionOverrides: new Map([
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
  ]),
};

export function nikkanSportsFilmReferences(
  editions: NikkanSportsEdition[],
): FilmReference[] {
  return filmAwardReferences(source, editions);
}

export function toImdbEventData(
  editions: NikkanSportsEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt?: string,
): ImdbEventCollectedData {
  return toFilmAwardEventData(source, editions, resolved, collectedAt);
}

export async function importNikkanSportsFilmAwards(options: {
  environment: Environment;
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<Record<string, ImdbEventImportStats>> {
  return importFilmAward({
    source,
    parse: parseNikkanSportsWikitext,
    ...options,
  });
}
