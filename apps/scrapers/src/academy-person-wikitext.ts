import {
  cellsOf,
  fillRow,
  type CarriedCell,
  type Cell,
} from './common/wikitext-table';

export type AcademyPersonEntry = {
  personName: string;
  filmPage: string | undefined;
  filmTitle: string;
  isWinner: boolean;
};

export type AcademyPersonEdition = {
  /** 対象作品の公開年。年をまたぐ初期の回は最初の年 */
  filmYear: number;
  ceremonyNumber: number;
  entries: AcademyPersonEntry[];
};

const AWARDS_SECTION = /^==\s*Winners and nominees\s*==/m;
const NEXT_SECTION = /\n==[^=]/;
const TABLE_START = /^\{\|/m;
const TABLE_END = '\n|}';
const ROW_SEPARATOR = /^\|-/m;
const WINNER_BACKGROUND = /background:\s*#faeb86/i;
const WIKI_LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;
const WIKI_LINKS = new RegExp(WIKI_LINK.source, 'g');
const FILM_YEAR = /\[\[(\d{4}) in film/;
const CEREMONY_NUMBER = /\[\[(\d+)(?:st|nd|rd|th) Academy Awards/;
const REFERENCE = /<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g;
const HTML_NOTE = /<small>[\s\S]*?<\/small>/g;
const HTML_TAG = /<[^>]+>/g;
const WRITE_IN = /write-in/i;
const NAME_SEPARATOR = /\s+(?:&|and)\s+|,\s+/;
const YEAR_HEADER = 'Year';
const FILM_HEADER = 'Film';
const IGNORED_HEADERS = ['Role', 'Ref'];

type ColumnLayout = {
  size: number;
  yearIndex: number;
  personIndex: number;
  filmIndex: number;
};

function columnLayout(header: Cell[]): ColumnLayout | undefined {
  const labels = header.map(cell => cell.content);
  const yearIndex = labels.indexOf(YEAR_HEADER);
  const filmIndex = labels.indexOf(FILM_HEADER);
  const personIndex = labels.findIndex(
    (label, index) =>
      index !== yearIndex &&
      index !== filmIndex &&
      IGNORED_HEADERS.every(ignored => !label.includes(ignored)),
  );

  return yearIndex === -1 || filmIndex === -1 || personIndex === -1
    ? undefined
    : {size: labels.length, yearIndex, personIndex, filmIndex};
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

/** {{sort|key|content}} は content に開き、それ以外のテンプレートは捨てる */
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
    if (name.trim().toLowerCase() === 'sort' && rest.length > 0) {
      result += stripTemplates(rest.join('|'));
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
  edition: AcademyPersonEdition | undefined,
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
  if (!filmTitle) {
    return undefined;
  }

  const known = edition?.entries.find(entry => entry.filmTitle === filmTitle);
  return {filmPage: known?.filmPage, filmTitle};
}

function parseTable(table: string): AcademyPersonEdition[] {
  const chunks = table.split(ROW_SEPARATOR);
  const headerIndex = chunks.findIndex(chunk =>
    chunk.split('\n').some(line => line.startsWith('!')),
  );
  if (headerIndex === -1) {
    return [];
  }

  const layout = columnLayout(cellsOf(chunks[headerIndex], ['!']));
  if (!layout) {
    return [];
  }

  const editions: AcademyPersonEdition[] = [];
  const carried: CarriedCell[] = [];

  const dataChunks = chunks.slice(headerIndex + 1);
  for (const chunk of dataChunks) {
    const own = cellsOf(chunk, ['!', '|']);
    if (own.length === 0) {
      continue;
    }

    const row = fillRow(own, carried, layout.size);
    const yearCell = row[layout.yearIndex];
    const filmYear = yearCell && FILM_YEAR.exec(yearCell.content);
    const ceremonyNumber = yearCell && CEREMONY_NUMBER.exec(yearCell.content);
    const personCell = row[layout.personIndex];
    const filmCell = row[layout.filmIndex];
    if (
      !filmYear ||
      !ceremonyNumber ||
      !personCell ||
      !filmCell ||
      WRITE_IN.test(personCell.content)
    ) {
      continue;
    }

    let edition = editions.at(-1);
    if (edition?.ceremonyNumber !== Number(ceremonyNumber[1])) {
      edition = {
        filmYear: Number(filmYear[1]),
        ceremonyNumber: Number(ceremonyNumber[1]),
        entries: [],
      };
      editions.push(edition);
    }

    const film = filmOf(filmCell, edition);
    if (!film) {
      continue;
    }

    const isWinner =
      WINNER_BACKGROUND.test(personCell.attributes) ||
      WINNER_BACKGROUND.test(filmCell.attributes);
    for (const personName of personNames(personCell)) {
      edition.entries.push({personName, ...film, isWinner});
    }
  }

  return editions;
}

export function parseAcademyPersonWikitext(
  wikitext: string,
): AcademyPersonEdition[] {
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
    .flatMap(table => parseTable(table.split(TABLE_END)[0]));
}
