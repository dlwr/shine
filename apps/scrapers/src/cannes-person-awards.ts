import {type Environment} from '@shine/database';
import {cannesCeremonyNumber, cannesCeremonyYear} from './cannes-ceremony';
import {
  importEnWikipediaAwards,
  type EnWikipediaAward,
  type EnWikipediaAwardSource,
} from './common/en-wikipedia-award';
import {type ImdbEventImportStats} from './imdb-event-award';

/** 英題の列にリンクが無い作品と、2部作で Wikidata に IMDb ID が無い作品（Che は Part One を代表に） */
const RESOLUTION_OVERRIDES = new Map<string, string>([
  ['30:Elisa, My Life', 'tt0075983'],
  ['61:Che', 'tt0892255'],
]);

const PERSON_NAME_ALIASES: Record<string, string> = {
  'Brillante Mendoza': 'Brillante Ma Mendoza',
  'Fernando Solanas': 'Fernando E. Solanas',
  'Hanna Laslo': 'Hana Laslo',
  'Nikolay Sergeev': 'Nikolai Sergeyev',
  'Sergei Vasilyev': 'Sergey Vasilev',
};

const FILM_HEADERS = ['English Title', 'Title'];

export const CANNES_SOURCE: EnWikipediaAwardSource = {
  organizationName: 'Cannes Film Festival',
  organizationCountry: 'France',
  firstCeremonyYear: 1946,
  ceremonyNumber: cannesCeremonyNumber,
  ceremonyYear: cannesCeremonyYear,
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

export const CANNES_PERSON_AWARDS: EnWikipediaAward[] = [
  {
    article: 'Cannes Film Festival Award for Best Director',
    category: 'Best Director',
    role: 'director',
    filmHeaders: FILM_HEADERS,
  },
  {
    article: 'Cannes Film Festival Award for Best Actor',
    category: 'Best Actor',
    role: 'actor',
    filmHeaders: FILM_HEADERS,
  },
  {
    article: 'Cannes Film Festival Award for Best Actress',
    category: 'Best Actress',
    role: 'actor',
    filmHeaders: FILM_HEADERS,
  },
];

export async function importCannesPersonAwards({
  environment,
  awards = CANNES_PERSON_AWARDS,
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
    source: CANNES_SOURCE,
    awards,
    dryRun,
    year,
    throttleMs,
  });
}
