import {type AwardTableOptions} from './award-table-types';
import {type Cell} from './wikitext-table';

const ITALIC = /(?<!')''(?!')|'''''/;
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

export function ceremonyNumberOf(
  yearCell: Cell,
  filmYear: number,
  options: AwardTableOptions,
): number | undefined {
  if (options.ceremonyPage === undefined) {
    return options.ceremonyNumberOf?.(filmYear);
  }

  const match = new RegExp(
    String.raw`\[\[(\d+)(?:st|nd|rd|th) ${options.ceremonyPage}`,
  ).exec(yearCell.content);
  return match ? Number(match[1]) : undefined;
}

export function columnLayout(
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
export function filmCellOf(
  row: Cell[],
  layout: ColumnLayout,
): Cell | undefined {
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
