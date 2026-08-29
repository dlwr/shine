import {type Environment} from '@shine/database';
import {
  importEnWikipediaAwards,
  type EnWikipediaAward,
  type EnWikipediaAwardSource,
} from './common/en-wikipedia-award';
import {type ImdbEventImportStats} from './imdb-event-award';
import {VENICE_SOURCE} from './venice-person-awards';

/**
 * 1952年の『やぶにらみの暴君』は記事名が1980年の改作版を指し、
 * 1968年の『Le Socrate』は英題の列にリンクが無く、
 * 2006年の『Dry Season』は記事名が乾季の記事を指す
 */
const RESOLUTION_OVERRIDES = new Map<string, string>([
  ['13:The Curious Adventures of Mr. Wonderbird', 'tt0044414'],
  ['29:Le Socrate', 'tt0128558'],
  ['63:Dry Season', 'tt0825241'],
]);

export const VENICE_JURY_SOURCE: EnWikipediaAwardSource = {
  ...VENICE_SOURCE,
  resolutionOverrides: RESOLUTION_OVERRIDES,
};

/** 記事によって見出しの大文字小文字が違う。原題の列は作品にしない */
const FILM_HEADERS = ['English Title', 'English title'];

export const VENICE_JURY_AWARDS: EnWikipediaAward[] = [
  {
    article: 'Grand Jury Prize (Venice Film Festival)',
    category: 'Grand Jury Prize',
    filmHeaders: FILM_HEADERS,
  },
  {
    article: 'Special Jury Prize (Venice Film Festival)',
    category: 'Special Jury Prize',
    filmHeaders: FILM_HEADERS,
  },
];

export async function importVeniceJuryAwards({
  environment,
  awards = VENICE_JURY_AWARDS,
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
    source: VENICE_JURY_SOURCE,
    awards,
    dryRun,
    year,
    throttleMs,
  });
}
