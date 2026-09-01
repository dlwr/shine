import {type Environment} from '@shine/database';
import {cannesCeremonyNumber} from './cannes-ceremony';
import {filmOf, type FilmAwardEntry} from './common/award-table-wikitext';
import {
  dropMisattributedResolutions,
  resolveFilmsByWikipediaPage,
  type FilmReference,
  type ResolvedFilm,
  type YearWindow,
} from './common/wikidata-film-resolver';
import {fetchWikitext} from './common/wikitext';
import {cellsOf, fillRow, type CarriedCell} from './common/wikitext-table';
import {
  importImdbEventAward,
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
  type ImdbEventNomination,
} from './imdb-event-award';

const CATEGORY = "Palme d'Or";
/** 節の見出しは年によって In Competition と Main Competition が入れ替わる。審査員の節も同じ見出しを使う */
const COMPETITION_SECTION = /^===\s*(?:In|Main) Competition\s*===/gim;
const NEXT_HEADING = /\n={2,}[^=]/;
const TABLE_START = /^\{\|/m;
const TABLE_END = '\n|}';
const ROW_SEPARATOR = /^\|-/m;
const WINNER_BACKGROUND = /background:\s*#ffdead/i;
const FILM_HEADERS = new Set(['English Title', 'English title', 'Title']);
/** 映画祭で初上映される作品が対象。TMDbの公開年が前年になる作品がある */
const PUBLICATION_WINDOW: YearWindow = {min: -1, max: 1};

/** 記事名からIMDb IDを引けない作品を直接指す。キーは「開催年:表示名」 */
const RESOLUTION_OVERRIDES = new Map<string, string>();

export const CANNES_PALME_DOR_CONFIG: ImdbEventAwardConfig = {
  organizationName: 'Cannes Film Festival',
  organizationCountry: 'France',
  establishedYear: 1946,
  categoryName: CATEGORY,
  ceremonyNumber: cannesCeremonyNumber,
  isCompetitionCategory: category => category === CATEGORY,
  minimumFilmsPerEdition: 1,
};

function competitionTables(wikitext: string): string[] {
  const tables: string[] = [];

  for (const heading of wikitext.matchAll(COMPETITION_SECTION)) {
    const afterHeading = wikitext.slice(heading.index + heading[0].length);
    const nextHeading = NEXT_HEADING.exec(afterHeading);
    const body = nextHeading
      ? afterHeading.slice(0, nextHeading.index)
      : afterHeading;
    const table = body.split(TABLE_START)[1]?.split(TABLE_END)[0];

    if (table) {
      tables.push(table);
    }
  }

  return tables;
}

/**
 * 開催年ごとの記事のコンペティション部門の表を読む。表に年の列は無く、
 * パルム・ドール受賞作は行の背景色で示される
 */
export function parseCompetitionEntries(wikitext: string): FilmAwardEntry[] {
  for (const table of competitionTables(wikitext)) {
    const entries = parseCompetitionTable(table);
    if (entries.length > 0) {
      return entries;
    }
  }

  return [];
}

function parseCompetitionTable(table: string): FilmAwardEntry[] {
  const chunks = table.split(ROW_SEPARATOR);
  const headerIndex = chunks.findIndex(chunk =>
    chunk.split('\n').some(line => line.trimStart().startsWith('!')),
  );
  if (headerIndex === -1) {
    return [];
  }

  const header = cellsOf(chunks[headerIndex], ['!']);
  const filmIndex = header.findIndex(cell => FILM_HEADERS.has(cell.content));
  if (filmIndex === -1) {
    return [];
  }

  const entries: FilmAwardEntry[] = [];
  const carried: CarriedCell[] = [];

  const dataChunks = chunks.slice(headerIndex + 1);
  for (const chunk of dataChunks) {
    const own = cellsOf(chunk, ['|']);
    if (own.length === 0) {
      continue;
    }

    const row = fillRow(own, carried, header.length);
    const filmCell = row[filmIndex];
    const film = filmCell && filmOf(filmCell);
    if (!filmCell || !film) {
      continue;
    }

    const rowAttributes = chunk.split('\n', 1)[0];
    entries.push({
      ...film,
      isWinner:
        WINNER_BACKGROUND.test(rowAttributes) ||
        WINNER_BACKGROUND.test(filmCell.attributes),
    });
  }

  return entries;
}

function referenceKey(entry: FilmAwardEntry): string {
  return entry.filmPage ?? entry.filmTitle;
}

export function competitionFilmReferences(
  year: number,
  entries: FilmAwardEntry[],
): FilmReference[] {
  const references = new Map<string, FilmReference>();

  for (const entry of entries) {
    const key = referenceKey(entry);
    if (!references.has(key)) {
      references.set(key, {
        key,
        title: entry.filmTitle,
        targetYear: year,
        yearWindow: PUBLICATION_WINDOW,
      });
    }
  }

  return references.values().toArray();
}

export function toCompetitionData(
  year: number,
  entries: FilmAwardEntry[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt = new Date().toISOString().slice(0, 10),
): ImdbEventCollectedData {
  const nominations: ImdbEventNomination[] = [];

  for (const entry of entries) {
    const match = resolved.get(referenceKey(entry));
    const imdbId =
      RESOLUTION_OVERRIDES.get(`${year}:${entry.filmTitle}`) ?? match?.imdbId;
    if (!imdbId) {
      console.log(`Unresolved: ${year} ${entry.filmTitle}`);
      continue;
    }

    nominations.push({
      isWinner: entry.isWinner,
      notes: null, // eslint-disable-line unicorn/no-null -- ImdbEventNominationの型に合わせる
      titles: [
        {
          imdbId,
          title: entry.filmTitle,
          originalTitle: match?.englishTitle ?? entry.filmTitle,
        },
      ],
    });
  }

  return {
    collectedAt,
    source: `https://en.wikipedia.org/wiki/${year}_Cannes_Film_Festival`,
    editions: [
      {
        year,
        awardNames: [CATEGORY],
        targetAward: [
          {
            categories: [
              {
                category: CATEGORY,
                total: null, // eslint-disable-line unicorn/no-null -- ImdbEventEditionの型に合わせる
                nominations,
              },
            ],
          },
        ],
      },
    ],
  };
}

export async function importCannesPalmeDOr({
  environment,
  year,
  dryRun = false,
  throttleMs = 300,
}: {
  environment: Environment;
  /** 映画祭の開催年 */
  year: number;
  dryRun?: boolean;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  const entries = parseCompetitionEntries(
    await fetchWikitext(`${year} Cannes Film Festival`, {language: 'en'}),
  );

  if (entries.length === 0) {
    throw new Error(
      `${year} Cannes Film Festivalの記事からコンペティション部門の表を読めませんでした`,
    );
  }

  console.log(
    `\n=== ${year} Cannes Film Festival: parsed ${entries.length} films in competition`,
  );

  const references = competitionFilmReferences(year, entries);
  const pages = references.map(reference => reference.key);

  console.log(`Resolving IMDb IDs for ${pages.length} articles...`);
  const resolved = await resolveFilmsByWikipediaPage(pages, {language: 'en'});
  console.log(`Resolved ${resolved.size}/${pages.length} articles`);

  const dropped = await dropMisattributedResolutions({
    references,
    resolved,
    tmdbApiKey: environment.TMDB_API_KEY,
    throttleMs,
  });
  if (dropped > 0) {
    console.log(`Dropped ${dropped} misattributed resolutions`);
  }

  return importImdbEventAward({
    environment,
    data: toCompetitionData(year, entries, resolved),
    config: CANNES_PALME_DOR_CONFIG,
    dryRun,
    year,
    throttleMs,
  });
}
