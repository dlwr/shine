import {type Environment} from '@shine/database';
import {
  ceremonyYearOf,
  importEnWikipediaAwards,
  type EnWikipediaAward,
  type EnWikipediaAwardSource,
} from './common/en-wikipedia-award';
import {type ImdbEventImportStats} from './imdb-event-award';

/** 記事が原作の小説・戯曲にリンクしている作品、リンクの無い作品、Wikidata が TV ミニシリーズを指す作品 */
const RESOLUTION_OVERRIDES = new Map<string, string>([
  ['14:Elmer Gantry', 'tt0053793'],
  ['15:A Raisin in the Sun', 'tt0055353'],
  ['29:Scenes from a Marriage', 'tt6725014'],
  ['74:County Lines', 'tt7156898'],
]);

const PERSON_NAME_ALIASES: Record<string, string> = {
  'Innokenty Smoktunovsky': 'Innokentiy Smoktunovskiy',
  'Tatiana Samoilova': 'Tatyana Samoylova',
  'Ziyi Zhang': 'Zhang Ziyi',
};

export const BAFTA_SOURCE: EnWikipediaAwardSource = {
  organizationName: 'British Academy Film Awards',
  organizationCountry: 'United Kingdom',
  firstCeremonyYear: 1948,
  ceremonyPage: 'British Academy Film Awards',
  categoryPrefix: 'BAFTA Award for ',
  /** 対象は前年公開の作品だが、初期は英国公開が数年遅れた外国映画が選ばれている（1942年の Four Steps in the Clouds が1949年の候補） */
  publicationWindow: {min: -8, max: 1},
  resolutionOverrides: RESOLUTION_OVERRIDES,
  personNameAliases: PERSON_NAME_ALIASES,
};

export const BAFTA_AWARDS: EnWikipediaAward[] = [
  {
    article: 'BAFTA Award for Best Film',
    category: 'BAFTA Award for Best Film',
  },
  {
    article: 'BAFTA Award for Best Direction',
    category: 'BAFTA Award for Best Direction',
    role: 'director',
  },
  {
    article: 'BAFTA Award for Best Actor in a Leading Role',
    category: 'BAFTA Award for Best Actor in a Leading Role',
    role: 'actor',
  },
  {
    article: 'BAFTA Award for Best Actress in a Leading Role',
    category: 'BAFTA Award for Best Actress in a Leading Role',
    role: 'actor',
  },
  {
    article: 'BAFTA Award for Best Actor in a Supporting Role',
    category: 'BAFTA Award for Best Actor in a Supporting Role',
    role: 'actor',
  },
  {
    article: 'BAFTA Award for Best Actress in a Supporting Role',
    category: 'BAFTA Award for Best Actress in a Supporting Role',
    role: 'actor',
  },
];

export function baftaCeremonyYear(ceremonyNumber: number): number {
  return ceremonyYearOf(BAFTA_SOURCE, ceremonyNumber);
}

export async function importBaftaAwards({
  environment,
  awards = BAFTA_AWARDS,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  awards?: EnWikipediaAward[];
  dryRun?: boolean;
  /** 授賞式の年。1948年が第1回 */
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  return importEnWikipediaAwards({
    environment,
    source: BAFTA_SOURCE,
    awards,
    dryRun,
    year,
    throttleMs,
  });
}
