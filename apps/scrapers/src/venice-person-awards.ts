import {type Environment} from '@shine/database';
import {
  importEnWikipediaAwards,
  type EnWikipediaAward,
  type EnWikipediaAwardSource,
} from './common/en-wikipedia-award';
import {type ImdbEventImportStats} from './imdb-event-award';
import {veniceCeremonyNumber, veniceCeremonyYear} from './venice-ceremony';

const RESOLUTION_OVERRIDES = new Map<string, string>();

const PERSON_NAME_ALIASES: Record<string, string> = {};

const FILM_HEADERS = ['English Title', 'Title'];

export const VENICE_SOURCE: EnWikipediaAwardSource = {
  organizationName: 'Venice Film Festival',
  organizationCountry: 'Italy',
  firstCeremonyYear: 1932,
  ceremonyNumber: veniceCeremonyNumber,
  ceremonyYear: veniceCeremonyYear,
  categoryPrefix: '',
  /** 映画祭で初上映される作品が対象だが、初期の回は前年以前の作品も出品された */
  publicationWindow: {min: -3, max: 1},
  sectionHeading: /^==\s*Winners\s*==/im,
  winnersOnly: true,
  /** 男優賞・女優賞の記事は助演賞の受賞者も同じ表に載せ、{{double dagger}} で区別している */
  otherAwardMarker: /\{\{double dagger/i,
  resolutionOverrides: RESOLUTION_OVERRIDES,
  personNameAliases: PERSON_NAME_ALIASES,
};

export const VENICE_PERSON_AWARDS: EnWikipediaAward[] = [
  {
    article: 'Silver Lion',
    category: 'Silver Lion for Best Director',
    role: 'director',
    filmHeaders: FILM_HEADERS,
    /** 記事は1990年以降の監督賞と、それ以前に作品へ贈られていた廃止部門を別の節に載せている */
    sectionHeading: /^==\s*Silver Lion for Best Direction[^=\n]*==/im,
  },
  {
    article: 'Volpi Cup for Best Actor',
    category: 'Volpi Cup for Best Actor',
    role: 'actor',
    filmHeaders: FILM_HEADERS,
  },
  {
    article: 'Volpi Cup for Best Actress',
    category: 'Volpi Cup for Best Actress',
    role: 'actor',
    filmHeaders: FILM_HEADERS,
  },
];

export async function importVenicePersonAwards({
  environment,
  awards = VENICE_PERSON_AWARDS,
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
    source: VENICE_SOURCE,
    awards,
    dryRun,
    year,
    throttleMs,
  });
}
