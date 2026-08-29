import {type Environment} from '@shine/database';
import {CANNES_SOURCE} from './cannes-person-awards';
import {
  importEnWikipediaAwards,
  type EnWikipediaAward,
} from './common/en-wikipedia-award';
import {type ImdbEventImportStats} from './imdb-event-award';

/** 記事によって見出しの大文字小文字が違う。原題の列は作品にしない */
const FILM_HEADERS = ['English Title', 'English title'];

export const CANNES_JURY_AWARDS: EnWikipediaAward[] = [
  {
    article: 'Grand Prix (Cannes Film Festival)',
    category: 'Grand Prix',
    filmHeaders: FILM_HEADERS,
  },
  {
    article: 'Jury Prize (Cannes Film Festival)',
    category: 'Jury Prize',
    filmHeaders: FILM_HEADERS,
  },
];

export async function importCannesJuryAwards({
  environment,
  awards = CANNES_JURY_AWARDS,
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
