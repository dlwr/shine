import {cellsOf, fillRow, type CarriedCell, type Cell} from './wikitext-table';

export type AwardTableOptions = {
  /** 回次リンクの記事名。[[22nd British Academy Film Awards|22nd]] なら 'British Academy Film Awards' */
  ceremonyPage: string;
  /** 受賞行の背景色。省略時は #FAEB86 */
  winnerBackground?: RegExp;
  /** 作品列の見出し。省略時は Film / Films */
  filmHeaders?: string[];
};

export type FilmAwardEntry = {
  filmPage: string | undefined;
  filmTitle: string;
  isWinner: boolean;
};

export type PersonAwardEntry = FilmAwardEntry & {
  personName: string;
};

export type AwardEdition<Entry extends FilmAwardEntry> = {
  /** 対象作品の公開年。年をまたぐ初期の回は最初の年 */
  filmYear: number;
  ceremonyNumber: number;
  entries: Entry[];
};

const AWARDS_SECTION = /^==\s*Winners and nomin(?:ees|ations)\s*==/im;
const NEXT_SECTION = /\n==[^=]/;
const TABLE_START = /^\{\|/m;
const TABLE_END = '\n|}';
const ROW_SEPARATOR = /^\|-/m;
const WINNER_BACKGROUND = /background:\s*#faeb86/i;
const WIKI_LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;
const WIKI_LINKS = new RegExp(WIKI_LINK.source, 'g');
const FILM_YEAR = /\[\[(\d{4}) in film|'''(\d{4})'''/;
/** [[1st Golden Globe Awards|1943]] や [[Golden Globe Awards 1980|1980]] のように年セルの最初の数字が公開年の表 */
const FIRST_YEAR = /\b(\d{4})\b/;
const NOT_AWARDED = /^(?:no award|not awarded)/i;
const REFERENCE = /<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g;
const HTML_NOTE = /<small>[\s\S]*?<\/small>/g;
const HTML_TAG = /<[^>]+>/g;
const WRITE_IN = /write-in/i;
const NAME_SEPARATOR = /\s+(?:&|and)\s+|,\s+/;
const ITALIC = /(?<!')''(?!')|'''''/;
const NAMED_PARAMETER = /^\s*\w+=/;
const YEAR_HEADER = 'Year';
const FILM_HEADERS = ['Film', 'Films'];
const ROLE_HEADER = 'Role';
const IGNORED_HEADERS = [ROLE_HEADER, 'Ref'];

type ColumnLayout = {
  size: number;
  yearIndex: number;
  personIndex: number | undefined;
  filmIndex: number;
  filmIndexes: number[];
  roleIndex: number | undefined;
};

function ceremonyNumberPattern(options: AwardTableOptions): RegExp {
  return new RegExp(
    String.raw`\[\[(\d+)(?:st|nd|rd|th) ${options.ceremonyPage}`,
  );
}

function columnLayout(
  header: Cell[],
  options: AwardTableOptions,
  hasPersonColumn: boolean,
): ColumnLayout | undefined {
  const labels = header.map(cell => cell.content);
  const filmHeaders = new Set(options.filmHeaders ?? FILM_HEADERS);
  const yearIndex = labels.indexOf(YEAR_HEADER);
  const filmIndexes = labels.flatMap((label, index) =>
    filmHeaders.has(label) ? [index] : [],
  );
  const personIndex = hasPersonColumn
    ? labels.findIndex(
        (label, index) =>
          index !== yearIndex &&
          !filmIndexes.includes(index) &&
          IGNORED_HEADERS.every(ignored => !label.includes(ignored)),
      )
    : undefined;

  const roleIndex = labels.findIndex(label => label.includes(ROLE_HEADER));

  return yearIndex === -1 || personIndex === -1 || filmIndexes.length === 0
    ? undefined
    : {
        size: labels.length,
        yearIndex,
        personIndex,
        filmIndex: filmIndexes[0],
        filmIndexes,
        roleIndex: roleIndex === -1 ? undefined : roleIndex,
      };
}

/** 見出しは Role | Film でも本文が Film | Role の記事があるので、斜体のセルを作品とみなす */
function filmCellOf(row: Cell[], layout: ColumnLayout): Cell | undefined {
  const byHeader = row[layout.filmIndex];
  if (
    layout.roleIndex === undefined ||
    (byHeader && ITALIC.test(byHeader.content))
  ) {
    return byHeader;
  }

  const byRole = row[layout.roleIndex];
  return byRole && ITALIC.test(byRole.content) ? byRole : byHeader;
}

function closingBraces(text: string, start: number): number {
  let depth = 0;
  for (let index = start; index < text.length - 1; index++) {
    if (text.startsWith('{{', index)) {
      depth++;
      index++;
    } else if (text.startsWith('}}', index)) {
      depth--;
      if (depth === 0) {
        return index;
      }

      index++;
    }
  }

  return -1;
}

/** {{sort|key|content}} と {{lang|code|content}} は content に開き、それ以外のテンプレートは捨てる */
function stripTemplates(text: string): string {
  let result = '';
  let cursor = 0;

  while (cursor < text.length) {
    const open = text.indexOf('{{', cursor);
    if (open === -1) {
      result += text.slice(cursor);
      break;
    }

    const close = closingBraces(text, open);
    if (close === -1) {
      result += text.slice(cursor);
      break;
    }

    result += text.slice(cursor, open);
    const inner = text.slice(open + 2, close);
    const [name, , ...rest] = inner.split('|');
    const templateName = name.trim().toLowerCase();
    if (
      (templateName === 'sort' || templateName === 'lang') &&
      rest.length > 0
    ) {
      result += stripTemplates(
        rest.filter(part => !NAMED_PARAMETER.test(part)).join('|'),
      );
    }

    cursor = close + 2;
  }

  return result;
}

function cleanContent(content: string): string {
  return stripTemplates(
    content.replaceAll(REFERENCE, '').replaceAll(HTML_NOTE, ''),
  )
    .replaceAll(HTML_TAG, '')
    .replaceAll("'''", '')
    .replaceAll("''", '')
    .replaceAll(/[†‡]/gu, '')
    .trim();
}

function personNames(cell: Cell): string[] {
  const text = cleanContent(cell.content).replaceAll(
    WIKI_LINKS,
    (_, page: string, display?: string) => display ?? page,
  );

  return text
    .split(NAME_SEPARATOR)
    .map(name => name.trim())
    .filter(name => name.length > 0);
}

function filmOf(
  cell: Cell,
  edition: AwardEdition<FilmAwardEntry> | undefined,
): {filmPage: string | undefined; filmTitle: string} | undefined {
  const cleaned = cleanContent(cell.content);
  const link = WIKI_LINK.exec(cleaned);
  if (link) {
    return {
      filmPage: link[1].trim(),
      filmTitle: (link[2] ?? link[1]).trim(),
    };
  }

  const filmTitle = cleaned.trim();
  if (!filmTitle || NOT_AWARDED.test(filmTitle)) {
    return undefined;
  }

  const known = edition?.entries.find(entry => entry.filmTitle === filmTitle);
  return {filmPage: known?.filmPage, filmTitle};
}

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

  const ceremonyPattern = ceremonyNumberPattern(options);
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
    const filmYear =
      yearCell &&
      (FILM_YEAR.exec(yearCell.content) ?? FIRST_YEAR.exec(yearCell.content));
    const ceremonyNumber = yearCell && ceremonyPattern.exec(yearCell.content);
    const personCell =
      layout.personIndex === undefined ? undefined : row[layout.personIndex];
    const filmCells = (
      hasPersonColumn
        ? [filmCellOf(row, layout)]
        : layout.filmIndexes.map(index => row[index])
    ).filter(cell => cell !== undefined);
    if (!filmYear || !ceremonyNumber || filmCells.length === 0) {
      continue;
    }

    if (hasPersonColumn && !personCell) {
      continue;
    }

    if (personCell && WRITE_IN.test(personCell.content)) {
      continue;
    }

    let edition = editions.at(-1);
    if (edition?.ceremonyNumber !== Number(ceremonyNumber[1])) {
      edition = {
        filmYear: Number(filmYear[1] ?? filmYear[2]),
        ceremonyNumber: Number(ceremonyNumber[1]),
        entries: [],
      };
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

function awardTables(wikitext: string): string[] {
  const heading = AWARDS_SECTION.exec(wikitext);
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
  return awardTables(wikitext).flatMap(table =>
    parseTable<PersonAwardEntry>(
      table,
      options,
      true,
      (film, filmCell, personCell) => {
        if (!personCell) {
          return [];
        }

        const isWinner =
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
  return awardTables(wikitext).flatMap(table =>
    parseTable<FilmAwardEntry>(table, options, false, (film, filmCell) => [
      {...film, isWinner: winnerBackground.test(filmCell.attributes)},
    ]),
  );
}
