import {filmOf, personNames} from './award-table-cell-text';
import {
  ceremonyNumberOf,
  columnLayout,
  filmCellOf,
} from './award-table-columns';
import {
  type AwardEdition,
  type AwardTableOptions,
  type FilmAwardEntry,
  type PersonAwardEntry,
} from './award-table-types';
import {cellsOf, fillRow, type CarriedCell, type Cell} from './wikitext-table';

const AWARDS_SECTION = /^==\s*Winners and nomin(?:ees|ations)\s*==/im;
const NEXT_SECTION = /\n==[^=]/;
const TABLE_START = /^\{\|/m;
const TABLE_END = '\n|}';
const ROW_SEPARATOR = /^\|-/m;
const WINNER_BACKGROUND = /background:\s*#faeb86/i;
const FILM_YEAR = /\[\[(\d{4}) in film|'''(\d{4})'''/;
/** [[1st Golden Globe Awards|1943]] や [[Golden Globe Awards 1980|1980]] のように年セルの最初の数字が公開年の表 */
const FIRST_YEAR = /\b(\d{4})\b/;
const WRITE_IN = /write-in/i;

function parseTable<Entry extends FilmAwardEntry>(
  table: string,
  options: AwardTableOptions,
  hasPersonColumn: boolean,
  entriesOf: (
    film: {filmPage: string | undefined; filmTitle: string},
    filmCell: Cell,
    personCell: Cell | undefined,
  ) => Entry[],
): Array<AwardEdition<Entry>> {
  const chunks = table.split(ROW_SEPARATOR);
  const headerIndex = chunks.findIndex(chunk =>
    chunk.split('\n').some(line => line.startsWith('!')),
  );
  if (headerIndex === -1) {
    return [];
  }

  const layout = columnLayout(
    cellsOf(chunks[headerIndex], ['!']),
    options,
    hasPersonColumn,
  );
  if (!layout) {
    return [];
  }

  const editions: Array<AwardEdition<Entry>> = [];
  const carried: CarriedCell[] = [];

  const dataChunks = chunks.slice(headerIndex + 1);
  for (const chunk of dataChunks) {
    const own = cellsOf(chunk, ['!', '|']);
    if (own.length === 0) {
      continue;
    }

    const row = fillRow(own, carried, layout.size);
    const yearCell = row[layout.yearIndex];
    const yearMatch =
      yearCell &&
      (FILM_YEAR.exec(yearCell.content) ?? FIRST_YEAR.exec(yearCell.content));
    const filmYear = yearMatch && Number(yearMatch[1] ?? yearMatch[2]);
    const ceremonyNumber =
      yearCell && filmYear
        ? ceremonyNumberOf(yearCell, filmYear, options)
        : undefined;
    const personCell =
      layout.personIndex === undefined ? undefined : row[layout.personIndex];
    const filmCells = (
      hasPersonColumn
        ? [filmCellOf(row, layout)]
        : layout.filmIndexes.map(index => row[index])
    ).filter(cell => cell !== undefined);
    if (!filmYear || ceremonyNumber === undefined || filmCells.length === 0) {
      continue;
    }

    if (hasPersonColumn && !personCell) {
      continue;
    }

    if (personCell && WRITE_IN.test(personCell.content)) {
      continue;
    }

    let edition = editions.at(-1);
    if (edition?.ceremonyNumber !== ceremonyNumber) {
      edition = {filmYear, ceremonyNumber, entries: []};
      editions.push(edition);
    }

    for (const filmCell of filmCells) {
      const film = filmOf(filmCell, edition);
      if (film) {
        edition.entries.push(...entriesOf(film, filmCell, personCell));
      }
    }
  }

  return editions.filter(edition => edition.entries.length > 0);
}

function awardTables(wikitext: string, options: AwardTableOptions): string[] {
  const heading = (options.sectionHeading ?? AWARDS_SECTION).exec(wikitext);
  if (!heading) {
    return [];
  }

  const afterHeading = wikitext.slice(heading.index + heading[0].length);
  const nextSection = NEXT_SECTION.exec(afterHeading);
  const body = nextSection
    ? afterHeading.slice(0, nextSection.index)
    : afterHeading;

  return body
    .split(TABLE_START)
    .slice(1)
    .map(table => table.split(TABLE_END)[0]);
}

export function parsePersonAwardWikitext(
  wikitext: string,
  options: AwardTableOptions,
): Array<AwardEdition<PersonAwardEntry>> {
  const winnerBackground = options.winnerBackground ?? WINNER_BACKGROUND;
  return awardTables(wikitext, options).flatMap(table =>
    parseTable<PersonAwardEntry>(
      table,
      options,
      true,
      (film, filmCell, personCell) => {
        if (!personCell || options.otherAwardMarker?.test(personCell.content)) {
          return [];
        }

        const isWinner =
          options.winnersOnly === true ||
          winnerBackground.test(personCell.attributes) ||
          winnerBackground.test(filmCell.attributes);
        return personNames(personCell).map(personName => ({
          personName,
          ...film,
          isWinner,
        }));
      },
    ),
  );
}

export function parseFilmAwardWikitext(
  wikitext: string,
  options: AwardTableOptions,
): Array<AwardEdition<FilmAwardEntry>> {
  const winnerBackground = options.winnerBackground ?? WINNER_BACKGROUND;
  return awardTables(wikitext, options).flatMap(table =>
    parseTable<FilmAwardEntry>(table, options, false, (film, filmCell) => [
      {
        ...film,
        isWinner:
          options.winnersOnly === true ||
          winnerBackground.test(filmCell.attributes),
      },
    ]),
  );
}
