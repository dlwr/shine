import * as cheerio from 'cheerio';
import {type Element} from 'domhandler';

export const WIKIPEDIA_BASE_URL = 'https://en.wikipedia.org';

export type TableColumns = {
  filmIndex: number;
  yearIndex: number;
  producerIndex: number;
  tableType: 'film' | 'producer' | 'unknown';
};

export type MovieInfo = {
  title: string;
  year: number;
  isWinner: boolean;
  referenceUrl?: string;
  imdbId?: string;
};

export function analyzeTableStructure(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<Element>,
  tableIndex: number,
): TableColumns | undefined {
  const headerRow = $table.find('tr').first();
  const headerTexts = headerRow
    .find('th')
    .map((_: number, element: Element) =>
      $(element).text().trim().toLowerCase(),
    )
    .get();

  console.log(`Table ${tableIndex} headers: ${headerTexts.join(' | ')}`);

  if (headerTexts.includes('nominations') && headerTexts.includes('wins')) {
    console.log(`Skipping table ${tableIndex} (appears to be statistics)`);
    return undefined;
  }

  let filmIndex = -1;
  let yearIndex = -1;
  let producerIndex = -1;

  headerRow.find('th').each((index: number, element: Element) => {
    const headerText = $(element).text().trim().toLowerCase();

    if (
      (headerText.includes('film') || headerText.includes('picture')) &&
      !headerText.includes('studio')
    ) {
      filmIndex = index;
    } else if (
      headerText.includes('year') ||
      headerText.includes('release') ||
      /^\d{4}(-\d{2})?$/.test(headerText)
    ) {
      yearIndex = index;
    } else if (
      headerText.includes('studio') ||
      headerText.includes('producer')
    ) {
      producerIndex = index;
    }
  });

  if (filmIndex === -1) {
    console.log(`Skipping table ${tableIndex} (no film column found)`);
    return undefined;
  }

  if (yearIndex === -1) {
    yearIndex = 0;
  }

  const tableType: 'film' | 'producer' | 'unknown' = headerTexts.some(text =>
    text.includes('producer'),
  )
    ? 'producer'
    : 'film';

  console.log(
    `Table ${tableIndex}: film=${filmIndex}, year=${yearIndex}, producer=${producerIndex}, type=${tableType}`,
  );

  return {
    filmIndex,
    yearIndex,
    producerIndex,
    tableType,
  };
}

export function processTableRows(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<Element>,
): MovieInfo[] {
  const rows = $table.find('tr');
  const result: MovieInfo[] = [];
  let currentYear: number | undefined;
  const processedTitles = new Set<string>();

  console.log(`Processing table with ${rows.length} rows`);

  // 1行目はヘッダーなのでスキップ
  for (let index = 1; index < rows.length; index++) {
    const $row = $(rows[index]);
    const cells = $row.find('td');
    const headers = $row.find('th');

    console.log(`\nProcessing row ${index}:`);
    console.log(`Headers: ${headers.length}, Cells: ${cells.length}`);

    if (cells.length === 0 && headers.length === 0) {
      console.log('Skipping empty row');
      continue;
    }

    const extractedYear = extractYear($row);
    if (extractedYear) {
      console.log(
        `Found new year: ${extractedYear} (previous: ${currentYear})`,
      );
      currentYear = extractedYear;
      processedTitles.clear();
    } else {
      console.log(`Using current year: ${currentYear}`);
    }

    if (!currentYear) {
      console.log('No year available, skipping row');
      continue;
    }

    const {title, referenceUrl, imdbId} = extractMovieTitle($, $row);
    if (!title) {
      console.log('No title found, skipping row');
      continue;
    }

    const dedupeKey = `${currentYear}-${title}`;

    if (processedTitles.has(dedupeKey)) {
      console.log(`Skipping duplicate: ${title} (${currentYear})`);
    } else {
      processedTitles.add(dedupeKey);
      const isWinner = isWinnerRow($row);

      console.log(
        `Adding movie: ${title} (${currentYear}) - ${
          isWinner ? 'Winner' : 'Nominee'
        } ${imdbId ? `IMDb: ${imdbId}` : ''}`,
      );

      result.push({
        title,
        year: currentYear,
        isWinner,
        referenceUrl,
        imdbId,
      });
    }
  }

  console.log(`\nProcessed ${result.length} movies from table`);
  return result;
}

function extractYear($row: cheerio.Cheerio<Element>): number | undefined {
  const rowHeader = $row.find('th').first();
  if (rowHeader.length > 0) {
    const yearText = rowHeader.text().trim();
    console.log('Found year header:', yearText);

    const yearRangeMatch = /(\d{4})[/-](\d{2})/.exec(yearText);
    if (yearRangeMatch) {
      const startYear = Number(yearRangeMatch[1]);
      const endYear = Number(yearRangeMatch[2]);
      const fullEndYear = startYear - (startYear % 100) + endYear;
      console.log(`Extracted year range: ${startYear}-${fullEndYear}`);
      return fullEndYear;
    }

    const singleYearMatch = /(\d{4})/.exec(yearText);
    if (singleYearMatch) {
      const year = Number(singleYearMatch[1]);
      console.log(`Extracted single year: ${year}`);
      return year;
    }
  }

  return undefined;
}

/** 受賞を示す星印は題名の末尾に付く。M*A*S*H のように題名自体が星印を含む */
const WINNER_MARKER = /\*\s*$/;

export function isWinnerRow($row: cheerio.Cheerio<Element>): boolean {
  const filmCell = $row.find('td').first();

  if (filmCell.find('b').length > 0) {
    return true;
  }

  if (filmCell.attr('style')?.includes('background:#FAEB86')) {
    return true;
  }

  if (filmCell.attr('bgcolor') === '#FAEB86') {
    return true;
  }

  if (filmCell.css('background-color')?.includes('#FAEB86')) {
    return true;
  }

  if (WINNER_MARKER.test(filmCell.text())) {
    return true;
  }

  return false;
}

function extractMovieTitle(
  $: cheerio.CheerioAPI,
  $row: cheerio.Cheerio<Element>,
): {title: string; referenceUrl?: string; imdbId?: string} {
  const filmCell = $row.find('td').first();
  if (!filmCell || filmCell.length === 0) {
    return {title: ''};
  }

  let referenceUrl: string | undefined;
  let imdbId: string | undefined;

  const italicElements = filmCell.find('i');
  const linkElement = filmCell.find('a').first();

  // IMDBリンクを探す
  filmCell.find('a').each((_: number, element: Element) => {
    const href = $(element).attr('href');
    if (href?.includes('imdb.com')) {
      imdbId = /\/title\/(tt\d+)/.exec(href)?.[1];
    }
  });

  if (linkElement.length > 0) {
    const href = linkElement.attr('href');
    if (href) {
      referenceUrl = `${WIKIPEDIA_BASE_URL}${href}`;
    }
  }

  let title =
    italicElements.length > 0
      ? italicElements.first().text().trim()
      : filmCell.text().trim();

  if (linkElement.length > 0) {
    const linkText = linkElement.first().text().trim();
    if (linkText.length > 0 && linkText.length < title.length) {
      title = linkText;
    }
  }

  return {title: cleanupTitle(title), referenceUrl, imdbId};
}

function cleanupTitle(title: string): string {
  return title
    .replaceAll(/\s*\([^)]*\)/g, '')
    .replaceAll(/\s*\[[^\]]*]/g, '')
    .replaceAll('*', '')
    .trim();
}
