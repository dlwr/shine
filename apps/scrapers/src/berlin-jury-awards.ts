import {type Environment} from '@shine/database';
import {BERLIN_SOURCE} from './berlin-person-awards';
import {
  importEnWikipediaAwards,
  type EnWikipediaAward,
  type EnWikipediaAwardSource,
} from './common/en-wikipedia-award';
import {type ImdbEventImportStats} from './imdb-event-award';

/**
 * 1988年の『コミッサール』は1967年の完成作が20年のお蔵入りを経て出品されたので公開年の窓に収まらず、
 * 2021年の『Mr Bachmann and His Class』は英題の列にリンクが無い
 */
const RESOLUTION_OVERRIDES = new Map<string, string>([
  ['38:Commissar', 'tt0061876'],
  ['71:Mr Bachmann and His Class', 'tt14035048'],
]);

export const BERLIN_JURY_SOURCE: EnWikipediaAwardSource = {
  ...BERLIN_SOURCE,
  resolutionOverrides: RESOLUTION_OVERRIDES,
};

/** 原題の列は作品にしない */
const FILM_HEADERS = ['English Title'];

export const BERLIN_JURY_AWARDS: EnWikipediaAward[] = [
  {
    article: 'Silver Bear Grand Jury Prize',
    category: 'Silver Bear Grand Jury Prize',
    filmHeaders: FILM_HEADERS,
  },
  {
    article: 'Silver Bear Jury Prize',
    category: 'Silver Bear Jury Prize',
    filmHeaders: FILM_HEADERS,
  },
];

export async function importBerlinJuryAwards({
  environment,
  awards = BERLIN_JURY_AWARDS,
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
    source: BERLIN_JURY_SOURCE,
    awards,
    dryRun,
    year,
    throttleMs,
  });
}
