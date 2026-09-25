import {createClient, type Value} from '@libsql/client';
import {queryWithColumnNames} from '@shine/database';

export type QueryResult = {
  columns: string[];
  rows: Value[][];
};

export type QueryFormat = 'tsv' | 'json';

const READ_ONLY_LEADING_KEYWORDS = new Set(['SELECT', 'WITH', 'EXPLAIN']);
const WRITE_KEYWORD_PATTERN =
  /\b(insert|update|delete|replace|create|drop|alter|vacuum|attach|detach|reindex|pragma)\b/i;

function stripTrailingSemicolon(query: string): string {
  return query.trim().replace(/;\s*$/, '');
}

function stripLiteralsAndComments(statement: string): string {
  return statement
    .replaceAll(/'(?:[^']|'')*'/g, "''")
    .replaceAll(/"(?:[^"]|"")*"/g, '""')
    .replaceAll(/--[^\n]*/g, '')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '');
}

function assertReadOnlyQuery(query: string): string {
  const statement = stripTrailingSemicolon(query);
  const leadingKeyword = statement.match(/^\s*([a-z]+)/i)?.[1]?.toUpperCase();

  if (!leadingKeyword || !READ_ONLY_LEADING_KEYWORDS.has(leadingKeyword)) {
    throw new Error(
      '読み取り専用です。SELECT・WITH・EXPLAIN で始まる文だけ実行できます',
    );
  }

  const bare = stripLiteralsAndComments(statement);

  if (bare.includes(';')) {
    throw new Error('1 文だけ実行できます');
  }

  if (WRITE_KEYWORD_PATTERN.test(bare)) {
    throw new Error('読み取り専用です。書き込みの句は実行できません');
  }

  return statement;
}

export async function runReadOnlyQuery(
  url: string,
  query: string,
): Promise<QueryResult> {
  const statement = assertReadOnlyQuery(query);
  const client = createClient({url});

  try {
    const transaction = await client.transaction('read');
    try {
      const result = await transaction.execute(statement);
      return {
        columns: result.columns,
        rows: result.rows.map(row =>
          result.columns.map((_, index) => row[index] ?? null),
        ),
      };
    } finally {
      transaction.close();
    }
  } finally {
    client.close();
  }
}

export async function runReadOnlyQueryOnD1(
  proxy: Parameters<typeof queryWithColumnNames>[0],
  query: string,
): Promise<QueryResult> {
  const statement = assertReadOnlyQuery(query);
  const {columns, rows} = await queryWithColumnNames(proxy, statement);
  return {columns, rows: rows as Value[][]};
}

function formatCell(value: Value): string {
  if (value === null) {
    return 'NULL';
  }

  if (value instanceof ArrayBuffer) {
    return `<blob ${value.byteLength} bytes>`;
  }

  return String(value);
}

export function formatQueryResult(
  result: QueryResult,
  format: QueryFormat,
): string {
  if (format === 'json') {
    const objects = result.rows.map(row =>
      Object.fromEntries(
        result.columns.map((column, index) => [
          column,
          typeof row[index] === 'bigint' ? Number(row[index]) : row[index],
        ]),
      ),
    );
    return JSON.stringify(objects, undefined, 2);
  }

  return [
    result.columns.join('\t'),
    ...result.rows.map(row => row.map(cell => formatCell(cell)).join('\t')),
  ].join('\n');
}
