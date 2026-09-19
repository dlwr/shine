import {type Environment} from '@shine/database';
import {importFilmAward} from './common/ja-wikipedia-film-award';
import {
  filmAwardReferences,
  toFilmAwardEventData,
  type FilmAwardSource,
} from './common/ja-wikipedia-film-award-source';
import {
  collectAwardLineFilms,
  splitEditions,
  type WikiFilm,
} from './common/ja-wikipedia-film-award-wikitext';
import {type FilmReference} from './common/film-resolution-checks';
import {type ResolvedFilm} from './common/wikidata-film-resolver';
import {
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
} from './imdb-event-award';

export const BEST_FILM_CATEGORY = '作品賞';
export const FOREIGN_CATEGORY = '作品賞・海外部門';

const EDITION_HEADING =
  /^====\s*(?:\[\[[^\]|]+\|)?第(\d+)回（(\d{4})年度）(?:]])?\s*====\s*$/m;

export type HochiEdition = {
  year: number;
  bestFilm: WikiFilm[];
  foreign: WikiFilm[];
};

// 第1回（1976年度）から毎年開催で欠年なし
export function hochiCeremonyNumber(year: number): number | undefined {
  return year >= 1976 ? year - 1975 : undefined;
}

export function parseHochiWikitext(wikitext: string): HochiEdition[] {
  return splitEditions(wikitext, EDITION_HEADING).map(({year, body}) => {
    const edition: HochiEdition = {year, bestFilm: [], foreign: []};
    const targets: Record<string, WikiFilm[]> = {
      [BEST_FILM_CATEGORY]: edition.bestFilm,
      [FOREIGN_CATEGORY]: edition.foreign,
    };
    collectAwardLineFilms(body, name => targets[name]);
    return edition;
  });
}

const source: FilmAwardSource<HochiEdition> = {
  article: '報知映画賞',
  organizationName: 'Hochi Film Awards',
  establishedYear: 1976,
  ceremonyNumber: hochiCeremonyNumber,
  categories: [
    {category: BEST_FILM_CATEGORY, films: edition => edition.bestFilm},
    {
      category: FOREIGN_CATEGORY,
      films: edition => edition.foreign,
      foreign: true,
    },
  ],
  /** 連作の共有記事や前後編分割で自動同定できない作品 */
  resolutionOverrides: new Map([
    // TMDbの邦題は「八日目の蟬」で字体が違い完全一致しない
    ['2011:八日目の蝉', 'tt1727825'],
    // 前篇・後篇の同時受賞。前篇を代表として指す
    ['2015:ソロモンの偽証 前篇・事件／後篇・裁判', 'tt3421614'],
  ]),
};

export function hochiFilmReferences(editions: HochiEdition[]): FilmReference[] {
  return filmAwardReferences(source, editions);
}

export function toImdbEventData(
  editions: HochiEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt?: string,
): ImdbEventCollectedData {
  return toFilmAwardEventData(source, editions, resolved, collectedAt);
}

export async function importHochiFilmAwards(options: {
  environment: Environment;
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<Record<string, ImdbEventImportStats>> {
  return importFilmAward({source, parse: parseHochiWikitext, ...options});
}
