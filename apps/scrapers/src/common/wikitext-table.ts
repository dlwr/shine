export type Cell = {
  attributes: string;
  content: string;
  rowspan: number;
};

export type CellMarker = '|' | '!';

export type CarriedCell = {cell: Cell; rowsLeft: number} | undefined;

export function parseCell(text: string): Cell {
  const body = text.slice(1).replace(/^\|/, '');
  const separator = body.indexOf('|');
  const prefix = separator === -1 ? '' : body.slice(0, separator);
  const hasAttributes =
    separator !== -1 && prefix.includes('=') && !prefix.includes('[[');

  const attributes = hasAttributes ? prefix : '';
  const content = hasAttributes ? body.slice(separator + 1) : body;
  const rowspan = /rowspan="?(\d+)/.exec(attributes);

  return {
    attributes,
    content: content.trim(),
    rowspan: rowspan ? Number(rowspan[1]) : 1,
  };
}

export function cellsOf(chunk: string, markers: CellMarker[]): Cell[] {
  return chunk
    .split('\n')
    .filter(
      line =>
        markers.some(marker => line.startsWith(marker)) &&
        !line.startsWith('|+') &&
        !line.startsWith('|}'),
    )
    .map(line => parseCell(line));
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
  }

  return row;
}
