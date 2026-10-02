import {
  cellsOf,
  fillRow,
  type CarriedCell,
  type Cell,
} from './common/wikitext-table';
import {
  type ListPersonAwardEdition,
  type ListPersonAwardEntry,
} from './common/ja-wikipedia-person-award-wikitext';

const AWARDS_SECTION = '== 受賞作品の一覧 ==';
const NEXT_SECTION = /\n== /;
const TABLE_START = /^\{\|/m;
const TABLE_END = '\n|}';
const ROW_SEPARATOR = /^\|-/m;
const WINNER_BACKGROUND = 'background:#FAEB86';
const WIKI_LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;
const YEAR = /\[\[(\d{4})年の映画/;
const CEREMONY_NUMBER = /第(\d+)回/;
const FILM_HEADER = '作品';
const YEAR_HEADER = '年';
const IGNORED_HEADERS = ['脚注', '役名', '備考'];

type ColumnLayout = {
  size: number;
  yearIndex: number;
  personIndex: number;
  filmIndex: number;
};

function columnLayout(header: Cell[]): ColumnLayout | undefined {
  const labels = header.map(cell => cell.content);
  const yearIndex = labels.indexOf(YEAR_HEADER);
  const filmIndex = labels.findIndex(label => label.includes(FILM_HEADER));
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

function parseEntry(
  row: Cell[],
  layout: ColumnLayout,
  category: string,
): ListPersonAwardEntry | undefined {
  const personCell = row[layout.personIndex];
  const filmCell = row[layout.filmIndex];
  if (!personCell || !filmCell) {
    return undefined;
  }

  const personLink = WIKI_LINK.exec(personCell.content);
  const filmLink = WIKI_LINK.exec(filmCell.content);
  if (!filmLink) {
    return undefined;
  }

  const personName = (
    personLink ? (personLink[2] ?? personLink[1]) : personCell.content
  )
    .replaceAll("'''", '')
    .trim();
  if (!personName) {
    return undefined;
  }

  return {
    category,
    people: [{name: personName, page: personLink?.[1].trim()}],
    films: [
      {
        page: filmLink[1].trim(),
        title: (filmLink[2] ?? filmLink[1]).replaceAll("'''", '').trim(),
      },
    ],
    isWinner: filmCell.attributes.includes(WINNER_BACKGROUND),
  };
}

function parseTable(table: string, category: string): ListPersonAwardEdition[] {
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

  const editions: ListPersonAwardEdition[] = [];
  const carried: CarriedCell[] = [];

  const dataChunks = chunks.slice(headerIndex + 1);
  for (const chunk of dataChunks) {
    const own = cellsOf(chunk, ['|']);
    // 記事に `|-` が連続する箇所があり、空行でrowspanを消費すると行がずれる
    if (own.length === 0) {
      continue;
    }

    const row = fillRow(own, carried, layout.size);
    const yearCell = row[layout.yearIndex];
    const year = yearCell && YEAR.exec(yearCell.content);
    const ceremonyNumber =
      yearCell &&
      CEREMONY_NUMBER.exec(yearCell.content.split('<br', 2)[1] ?? '');
    if (!year || !ceremonyNumber) {
      continue;
    }

    const entry = parseEntry(row, layout, category);
    if (!entry) {
      continue;
    }

    const edition = editions.at(-1);
    if (edition?.year === Number(year[1])) {
      edition.entries.push(entry);
    } else {
      editions.push({
        year: Number(year[1]),
        ceremonyNumber: Number(ceremonyNumber[1]),
        entries: [entry],
      });
    }
  }

  return editions;
}

export function parseJapanAcademyPersonWikitext(
  wikitext: string,
  category: string,
): ListPersonAwardEdition[] {
  const afterHeading = wikitext.split(AWARDS_SECTION)[1];
  if (!afterHeading) {
    return [];
  }

  const nextSection = NEXT_SECTION.exec(afterHeading);
  const body = nextSection
    ? afterHeading.slice(0, nextSection.index)
    : afterHeading;

  return body
    .split(TABLE_START)
    .slice(1)
    .flatMap(table => parseTable(table.split(TABLE_END)[0], category));
}
