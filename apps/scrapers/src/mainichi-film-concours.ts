import {type Environment} from '@shine/database';
import {
  filmAwardConfig,
  filmAwardReferences,
  importFilmAward,
  parseBracketedFilms,
  splitEditions,
  toFilmAwardEventData,
  type FilmAwardSource,
  type WikiFilm,
} from './common/ja-wikipedia-film-award';
import {type FilmReference} from './common/film-resolution-checks';
import {type ResolvedFilm} from './common/wikidata-film-resolver';
import {
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
} from './imdb-event-award';

export const GRAND_PRIX_CATEGORY = '日本映画大賞';
export const EXCELLENCE_CATEGORY = '日本映画優秀賞';
export const FOREIGN_CATEGORY = '外国映画ベストワン賞';

// 第30回までの名称は日本映画賞。日本映画大賞に統一して取り込む
const GRAND_PRIX_NAMES = new Set(['日本映画賞', GRAND_PRIX_CATEGORY]);

const EDITION_HEADING =
  /^====\s*(?:\[\[[^\]|]+\|)?第(\d+)回（(\d{4})年）(?:]])?\s*====\s*$/m;
const AWARD_LINE = /^:\*\*\s*(\S+)\s*(.*)$/;

export type MainichiEdition = {
  year: number;
  grandPrix: WikiFilm[];
  excellence: WikiFilm[];
  foreign: WikiFilm[];
};

// 第1回（1946年）から毎年、中断なし
export function mainichiCeremonyNumber(year: number): number | undefined {
  return year < 1946 ? undefined : year - 1945;
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
        edition.excellence.push(...parseBracketedFilms(trimmed));
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
      edition.grandPrix.push(...parseBracketedFilms(rest));
    } else if (name === EXCELLENCE_CATEGORY) {
      edition.excellence.push(...parseBracketedFilms(rest));
      isPendingExcellence = true;
    } else if (name === FOREIGN_CATEGORY) {
      edition.foreign.push(...parseBracketedFilms(rest));
    }
  }

  return edition;
}

export function parseMainichiWikitext(wikitext: string): MainichiEdition[] {
  return splitEditions(wikitext, EDITION_HEADING).map(({year, body}) =>
    parseEditionBody(year, body),
  );
}

const source: FilmAwardSource<MainichiEdition> = {
  article: '毎日映画コンクール',
  organizationName: 'Mainichi Film Awards',
  establishedYear: 1946,
  ceremonyNumber: mainichiCeremonyNumber,
  categories: [
    {category: GRAND_PRIX_CATEGORY, films: edition => edition.grandPrix},
    {
      category: EXCELLENCE_CATEGORY,
      films: edition => edition.excellence,
      nomination: () => ({isWinner: false, notes: null}),
    },
    {
      category: FOREIGN_CATEGORY,
      films: edition => edition.foreign,
      foreign: true,
    },
  ],
  /** 連作の共有記事や前後編分割で自動同定できない作品 */
  resolutionOverrides: new Map([
    ['1961:人間の條件', 'tt0055233'],
    ['1993:学校', 'tt0202364'],
    ['1996:学校II', 'tt0116386'],
    ['1998:学校III', 'tt0245127'],
    ['2000:十五才 学校IV', 'tt0338679'],
    ['2002:OUT', 'tt0340280'],
    ['2020:アンダードッグ', 'tt14051616'],
  ]),
};

export const mainichiGrandPrixConfig: ImdbEventAwardConfig = filmAwardConfig(
  source,
  GRAND_PRIX_CATEGORY,
);

export function mainichiFilmReferences(
  editions: MainichiEdition[],
): FilmReference[] {
  return filmAwardReferences(source, editions);
}

export function toImdbEventData(
  editions: MainichiEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt?: string,
): ImdbEventCollectedData {
  return toFilmAwardEventData(source, editions, resolved, collectedAt);
}

export async function importMainichiFilmConcours(options: {
  environment: Environment;
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<Record<string, ImdbEventImportStats>> {
  return importFilmAward({source, parse: parseMainichiWikitext, ...options});
}
