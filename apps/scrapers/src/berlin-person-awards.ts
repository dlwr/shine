import {type Environment} from '@shine/database';
import {
  importEnWikipediaAwards,
  type EnWikipediaAward,
  type EnWikipediaAwardSource,
} from './common/en-wikipedia-award';
import {type ImdbEventImportStats} from './imdb-event-award';

const RESOLUTION_OVERRIDES = new Map<string, string>();

const PERSON_NAME_ALIASES: Record<string, string> = {};

const FILM_HEADERS = ['English Title', 'Title'];

export const BERLIN_SOURCE: EnWikipediaAwardSource = {
  organizationName: 'Berlin International Film Festival',
  organizationCountry: 'Germany',
  firstCeremonyYear: 1951,
  ceremonyPage: 'Berlin International Film Festival',
  categoryPrefix: '',
  /** 2月開催なので前年の作品が多いが、初期の回は数年前の作品も出品された */
  publicationWindow: {min: -3, max: 1},
  sectionHeading: /^==\s*Winners\s*==/im,
  winnersOnly: true,
  resolutionOverrides: RESOLUTION_OVERRIDES,
  personNameAliases: PERSON_NAME_ALIASES,
};

/** 男優賞・女優賞は2020年で廃止され、2021年から性別のない主演・助演の演技賞になった */
export const BERLIN_PERSON_AWARDS: EnWikipediaAward[] = [
  {
    article: 'Silver Bear for Best Director',
    category: 'Silver Bear for Best Director',
    role: 'director',
    filmHeaders: FILM_HEADERS,
  },
  {
    article: 'Silver Bear for Best Actor',
    category: 'Silver Bear for Best Actor',
    role: 'actor',
    filmHeaders: FILM_HEADERS,
  },
  {
    article: 'Silver Bear for Best Actress',
    category: 'Silver Bear for Best Actress',
    role: 'actor',
    filmHeaders: FILM_HEADERS,
  },
  {
    article: 'Silver Bear for Best Leading Performance',
    category: 'Silver Bear for Best Leading Performance',
    role: 'actor',
    filmHeaders: FILM_HEADERS,
  },
  {
    article: 'Silver Bear for Best Supporting Performance',
    category: 'Silver Bear for Best Supporting Performance',
    role: 'actor',
    filmHeaders: FILM_HEADERS,
  },
];

export async function importBerlinPersonAwards({
  environment,
  awards = BERLIN_PERSON_AWARDS,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  awards?: EnWikipediaAward[];
  dryRun?: boolean;
  /** 映画祭の開催年 */
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  return importEnWikipediaAwards({
    environment,
    source: BERLIN_SOURCE,
    awards,
    dryRun,
    year,
    throttleMs,
  });
}
