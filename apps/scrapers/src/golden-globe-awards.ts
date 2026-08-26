import {type Environment} from '@shine/database';
import {
  ceremonyYearOf,
  importEnWikipediaAwards,
  type EnWikipediaAward,
  type EnWikipediaAwardSource,
} from './common/en-wikipedia-award';
import {type ImdbEventImportStats} from './imdb-event-award';

/** 記事にリンクの無い作品、原作の小説・戯曲にリンクしている作品、米国公開が遅れて年窓に入らない作品、Wikidata が TV ミニシリーズを指す作品 */
const RESOLUTION_OVERRIDES = new Map<string, string>([
  ['13:Eyes of Children', 'tt0262548'],
  ['13:Dangerous Curves', 'tt0154372'],
  ['14:Roses on the Arm', 'tt0049821'],
  ['14:The White Reindeer', 'tt0045283'],
  ['18:The Dark at the Top of the Stairs', 'tt0053750'],
  ['20:My Son, the Hero (Los Hermanos Del Hierro)', 'tt0054969'],
  ['20:Sweet Bird of Youth', 'tt0056541'],
  ['28:The Great White Hope', 'tt0065797'],
  ['32:Scenes from a Marriage', 'tt6725014'],
  ['37:Chapter Two', 'tt0078952'],
  ['37:The Europeans', 'tt0079123'],
  ['37:Till Marriage Do Us Part', 'tt0071844'],
]);

const PERSON_NAME_ALIASES: Record<string, string> = {
  'Beatrice Arthur': 'Bea Arthur',
  'Howard E. Rollins, Jr.': 'Howard Rollins',
  'Noriyuki "Pat" Morita': 'Pat Morita',
  'Oscar Homolka': 'Oskar Homolka',
};

export const GOLDEN_GLOBE_SOURCE: EnWikipediaAwardSource = {
  organizationName: 'Golden Globe Awards',
  organizationCountry: 'United States',
  firstCeremonyYear: 1944,
  ceremonyPage: 'Golden Globe Awards',
  categoryPrefix: 'Golden Globe Award for ',
  /** 記事の年は対象作品の公開年。非英語映画は本国公開が米国公開より数年早い */
  publicationWindow: {min: -3, max: 1},
  /** 1958〜62年度の作品賞はコメディ部門とミュージカル部門に分かれ、後者の受賞行は別の色 */
  winnerBackground: /background:\s*#(?:b0c4de|90ee90)/i,
  resolutionOverrides: RESOLUTION_OVERRIDES,
  personNameAliases: PERSON_NAME_ALIASES,
};

export const GOLDEN_GLOBE_AWARDS: EnWikipediaAward[] = [
  {
    article: 'Golden Globe Award for Best Motion Picture – Drama',
    category: 'Golden Globe Award for Best Motion Picture – Drama',
  },
  {
    article: 'Golden Globe Award for Best Motion Picture – Musical or Comedy',
    category: 'Golden Globe Award for Best Motion Picture – Musical or Comedy',
    filmHeaders: ['Film', 'Comedy', 'Musical'],
  },
  {
    article:
      'Golden Globe Award for Best Motion Picture – Non-English Language',
    category:
      'Golden Globe Award for Best Motion Picture – Non-English Language',
    filmHeaders: ['English title'],
  },
  {
    article: 'Golden Globe Award for Best Animated Feature Film',
    category: 'Golden Globe Award for Best Animated Feature Film',
  },
  {
    article: 'Golden Globe Award for Best Director',
    category: 'Golden Globe Award for Best Director',
    role: 'director',
  },
  {
    article: 'Golden Globe Award for Best Actor in a Motion Picture – Drama',
    category: 'Golden Globe Award for Best Actor in a Motion Picture – Drama',
    role: 'actor',
  },
  {
    article:
      'Golden Globe Award for Best Actor in a Motion Picture – Musical or Comedy',
    category:
      'Golden Globe Award for Best Actor in a Motion Picture – Musical or Comedy',
    role: 'actor',
  },
  {
    article: 'Golden Globe Award for Best Actress in a Motion Picture – Drama',
    category: 'Golden Globe Award for Best Actress in a Motion Picture – Drama',
    role: 'actor',
  },
  {
    article:
      'Golden Globe Award for Best Actress in a Motion Picture – Musical or Comedy',
    category:
      'Golden Globe Award for Best Actress in a Motion Picture – Musical or Comedy',
    role: 'actor',
  },
  {
    article: 'Golden Globe Award for Best Supporting Actor – Motion Picture',
    category: 'Golden Globe Award for Best Supporting Actor – Motion Picture',
    role: 'actor',
  },
  {
    article: 'Golden Globe Award for Best Supporting Actress – Motion Picture',
    category: 'Golden Globe Award for Best Supporting Actress – Motion Picture',
    role: 'actor',
  },
];

export function goldenGlobeCeremonyYear(ceremonyNumber: number): number {
  return ceremonyYearOf(GOLDEN_GLOBE_SOURCE, ceremonyNumber);
}

export async function importGoldenGlobeAwards({
  environment,
  awards = GOLDEN_GLOBE_AWARDS,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  awards?: EnWikipediaAward[];
  dryRun?: boolean;
  /** 授賞式の年。1944年が第1回 */
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  return importEnWikipediaAwards({
    environment,
    source: GOLDEN_GLOBE_SOURCE,
    awards,
    dryRun,
    year,
    throttleMs,
  });
}
