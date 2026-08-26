export type Cell = {
  attributes: string;
  content: string;
  rowspan: number;
  colspan: number;
};

export type CellMarker = '|' | '!';

export type CarriedCell = {cell: Cell; rowsLeft: number} | undefined;

const INLINE_SEPARATOR: Record<CellMarker, RegExp> = {
  '|': /\|\|/,
  '!': /!!|\|\|/,
};

function spanOf(attributes: string, name: string): number {
  const span = new RegExp(String.raw`${name}="?(\d+)`).exec(attributes);
  return span ? Number(span[1]) : 1;
}

export function parseCell(text: string): Cell {
  const body = text.slice(1).replace(/^\|/, '');
  const separator = body.indexOf('|');
  const prefix = separator === -1 ? '' : body.slice(0, separator);
  const hasAttributes =
    separator !== -1 && prefix.includes('=') && !prefix.includes('[[');

  const attributes = hasAttributes ? prefix : '';
  const content = hasAttributes ? body.slice(separator + 1) : body;

  return {
    attributes,
    content: content.trim(),
    rowspan: spanOf(attributes, 'rowspan'),
    colspan: spanOf(attributes, 'colspan'),
  };
}

/** 先頭の || は空の属性なので区切りにしない */
function splitInlineCells(line: string): string[] {
  const marker = line[0] as CellMarker;
  const [first, ...rest] = line.slice(1).split(INLINE_SEPARATOR[marker]);
  return [first, ...rest].map(piece => `${marker}${piece}`);
}

export function cellsOf(chunk: string, markers: CellMarker[]): Cell[] {
  return chunk
    .split('\n')
    .map(line => line.trimStart())
    .filter(
      line =>
        markers.some(marker => line.startsWith(marker)) &&
        !line.startsWith('|+') &&
        !line.startsWith('|}'),
    )
    .flatMap(line => splitInlineCells(line).map(cell => parseCell(cell)));
}

export function fillRow(
  own: Cell[],
  carried: CarriedCell[],
  size: number,
): Cell[] {
  const row: Cell[] = [];
  let ownIndex = 0;

  for (let column = 0; column < size; column++) {
    const carry = carried[column];
    if (carry && carry.rowsLeft > 0) {
      row[column] = carry.cell;
      carry.rowsLeft--;
      continue;
    }

    const cell = own[ownIndex];
    ownIndex++;
    if (!cell) {
      break;
    }

    row[column] = cell;
    if (cell.rowspan > 1) {
      carried[column] = {cell, rowsLeft: cell.rowspan - 1};
    }

    column += cell.colspan - 1;
  }

  return row;
}
