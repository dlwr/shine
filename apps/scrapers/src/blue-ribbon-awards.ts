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

// 第2回のみ海外映画賞という名称だった。外国作品賞に統一して取り込む
const FOREIGN_NAMES = new Set(['海外映画賞', FOREIGN_CATEGORY]);

const EDITION_HEADING =
  /^====\s*(?:\[\[[^\]|]+\|)?第(\d+)回（(\d{4})年度）(?:]])?\s*====\s*$/m;

export type BlueRibbonEdition = {
  year: number;
  bestFilm: WikiFilm[];
  foreign: WikiFilm[];
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

export function parseBlueRibbonWikitext(wikitext: string): BlueRibbonEdition[] {
  return splitEditions(wikitext, EDITION_HEADING).map(({year, body}) => {
    const edition: BlueRibbonEdition = {year, bestFilm: [], foreign: []};
    collectAwardLineFilms(body, name => {
      if (name === BEST_FILM_CATEGORY) {
        return edition.bestFilm;
      }

      return FOREIGN_NAMES.has(name) ? edition.foreign : undefined;
    });
    return edition;
  });
}

const source: FilmAwardSource<BlueRibbonEdition> = {
  article: 'ブルーリボン賞 (映画)',
  organizationName: 'Blue Ribbon Awards',
  establishedYear: 1950,
  ceremonyNumber: blueRibbonCeremonyNumber,
  categories: [
    {category: BEST_FILM_CATEGORY, films: edition => edition.bestFilm},
    {
      category: FOREIGN_CATEGORY,
      films: edition => edition.foreign,
      foreign: true,
    },
  ],
  resolutionOverrides: new Map([
    // 記事がシリーズ全体（ジュラシックパーク）で映画単体に解決できない
    ['1993:ジュラシックパーク', 'tt0107290'],
  ]),
};

export function blueRibbonFilmReferences(
  editions: BlueRibbonEdition[],
): FilmReference[] {
  return filmAwardReferences(source, editions);
}

export function toImdbEventData(
  editions: BlueRibbonEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt?: string,
): ImdbEventCollectedData {
  return toFilmAwardEventData(source, editions, resolved, collectedAt);
}

export async function importBlueRibbonAwards(options: {
  environment: Environment;
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<Record<string, ImdbEventImportStats>> {
  return importFilmAward({source, parse: parseBlueRibbonWikitext, ...options});
}
