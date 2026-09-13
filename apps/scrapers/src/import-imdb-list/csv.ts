import {readFileSync} from 'node:fs';
import {parse} from 'csv-parse/sync';
import {type CsvMovieRow} from './types';

export function readUniqueCsvRecords(filePath: string): CsvMovieRow[] {
  const fileContent = readFileSync(filePath, 'utf8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvMovieRow[];

  const uniqueRecords: CsvMovieRow[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const imdbId = record.Const?.trim();
    if (!imdbId || seen.has(imdbId)) {
      continue;
    }

    uniqueRecords.push(record);
    seen.add(imdbId);
  }

  return uniqueRecords;
}
