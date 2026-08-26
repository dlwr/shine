import {type Environment} from '@shine/database';
import {type AcademyPersonEdition} from './academy-person-wikitext';
import {
  awardConfig,
  awardFilmReferences,
  ceremonyNumberOf,
  ceremonyYearOf,
  importEnWikipediaAward,
  importEnWikipediaAwards,
  toImdbEventData as buildImdbEventData,
  type EnWikipediaAward,
  type EnWikipediaAwardSource,
  type PersonRole,
} from './common/en-wikipedia-award';
import {
  type FilmReference,
  type ResolvedFilm,
} from './common/wikidata-film-resolver';
import {
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
} from './imdb-event-award';

export const ACADEMY_SOURCE: EnWikipediaAwardSource = {
  organizationName: 'Academy Awards',
  organizationCountry: 'United States',
  firstCeremonyYear: 1929,
  ceremonyPage: 'Academy Awards',
  categoryPrefix: 'Academy Award for ',
  /** 対象は暦年公開の作品。映画祭プレミアや本国公開が前年になることがある */
  publicationWindow: {min: -2, max: 1},
  resolutionOverrides: new Map<string, string>(),
  personNameAliases: {},
};

export function academyCeremonyYear(ceremonyNumber: number): number {
  return ceremonyYearOf(ACADEMY_SOURCE, ceremonyNumber);
}

export function academyCeremonyNumber(ceremonyYear: number): number {
  return ceremonyNumberOf(ACADEMY_SOURCE, ceremonyYear);
}

export type AcademyPersonAward = EnWikipediaAward & {role: PersonRole};

export const ACADEMY_PERSON_AWARDS: AcademyPersonAward[] = [
  {
    article: 'Academy Award for Best Director',
    category: 'Academy Award for Best Director',
    role: 'director',
  },
  {
    article: 'Academy Award for Best Actor',
    category: 'Academy Award for Best Actor',
    role: 'actor',
  },
  {
    article: 'Academy Award for Best Actress',
    category: 'Academy Award for Best Actress',
    role: 'actor',
  },
  {
    article: 'Academy Award for Best Supporting Actor',
    category: 'Academy Award for Best Supporting Actor',
    role: 'actor',
  },
  {
    article: 'Academy Award for Best Supporting Actress',
    category: 'Academy Award for Best Supporting Actress',
    role: 'actor',
  },
];

export function academyPersonFilmReferences(
  editions: AcademyPersonEdition[],
): FilmReference[] {
  return awardFilmReferences(ACADEMY_SOURCE, editions);
}

export function toImdbEventData(
  award: AcademyPersonAward,
  editions: AcademyPersonEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt?: string,
): ImdbEventCollectedData {
  return buildImdbEventData(
    ACADEMY_SOURCE,
    award,
    editions,
    resolved,
    collectedAt,
  );
}

export function academyPersonConfig(
  award: AcademyPersonAward,
): ImdbEventAwardConfig {
  return awardConfig(ACADEMY_SOURCE, award);
}

export async function importAcademyPersonAward({
  environment,
  award,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  award: AcademyPersonAward;
  dryRun?: boolean;
  /** 授賞式の年。1929年が第1回 */
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  return importEnWikipediaAward({
    environment,
    source: ACADEMY_SOURCE,
    award,
    dryRun,
    year,
    throttleMs,
  });
}

export async function importAcademyPersonAwards({
  environment,
  awards = ACADEMY_PERSON_AWARDS,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  awards?: AcademyPersonAward[];
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  return importEnWikipediaAwards({
    environment,
    source: ACADEMY_SOURCE,
    awards,
    dryRun,
    year,
    throttleMs,
  });
}
