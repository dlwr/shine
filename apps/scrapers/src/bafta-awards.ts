import {type Environment} from '@shine/database';
import {
  ceremonyYearOf,
  importEnWikipediaAwards,
  type EnWikipediaAward,
  type EnWikipediaAwardSource,
} from './common/en-wikipedia-award';
import {type ImdbEventImportStats} from './imdb-event-award';

export const BAFTA_SOURCE: EnWikipediaAwardSource = {
  organizationName: 'British Academy Film Awards',
  organizationCountry: 'United Kingdom',
  firstCeremonyYear: 1948,
  ceremonyPage: 'British Academy Film Awards',
  categoryPrefix: 'BAFTA Award for ',
  /** 対象は前年公開の作品。英国公開が本国より遅れて年をまたぐことがある */
  publicationWindow: {min: -2, max: 1},
  resolutionOverrides: new Map<string, string>(),
  personNameAliases: {},
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
