import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createClient} from '@libsql/client';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  formatQueryResult,
  runReadOnlyQuery,
  runReadOnlyQueryOnD1,
} from '../sql-query';

let directory: string;
let url: string;

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-sql-query-'));
  url = `file:${path.join(directory, 'source.db')}`;
  const client = createClient({url});
  await client.batch(
    [
      'CREATE TABLE films (uid TEXT PRIMARY KEY, title TEXT, year INTEGER)',
      "INSERT INTO films VALUES ('a', 'さざなみ', 2015), ('b', 'Delete Me', NULL)",
    ],
    'write',
  );
  client.close();
});

afterAll(async () => {
  await fs.rm(directory, {recursive: true, force: true});
});

async function countRows(): Promise<number> {
  const client = createClient({url});
  try {
    const result = await client.execute('SELECT count(*) AS n FROM films');
    return Number(result.rows[0]?.n);
  } finally {
    client.close();
  }
}

describe('runReadOnlyQuery', () => {
  it('SELECT の列名と行を返す', async () => {
    const result = await runReadOnlyQuery(
      {url, authToken: ''},
      'SELECT uid, title, year FROM films ORDER BY uid',
    );

    expect(result.columns).toEqual(['uid', 'title', 'year']);
    expect(result.rows).toEqual([
      ['a', 'さざなみ', 2015],
      ['b', 'Delete Me', null],
    ]);
  });

  it('WITH で始まる読み取りを通す', async () => {
    const result = await runReadOnlyQuery(
      {url, authToken: ''},
      'WITH recent AS (SELECT * FROM films WHERE year IS NOT NULL) SELECT count(*) AS n FROM recent',
    );

    expect(result.rows).toEqual([[1]]);
  });

  it('文字列の中に delete があっても読み取りなら通す', async () => {
    const result = await runReadOnlyQuery(
      {url, authToken: ''},
      "SELECT uid FROM films WHERE title = 'Delete Me'",
    );

    expect(result.rows).toEqual([['b']]);
  });

  it('INSERT を拒否して何も書かない', async () => {
    await expect(
      runReadOnlyQuery(
        {url, authToken: ''},
        "INSERT INTO films VALUES ('c', 'x', 2000)",
      ),
    ).rejects.toThrow(/読み取り専用/);
    expect(await countRows()).toBe(2);
  });

  it('WITH で始まる書き込みも拒否する', async () => {
    await expect(
      runReadOnlyQuery(
        {url, authToken: ''},
        "WITH x AS (SELECT 'c' AS uid) INSERT INTO films (uid) SELECT uid FROM x",
      ),
    ).rejects.toThrow(/読み取り専用/);
    expect(await countRows()).toBe(2);
  });

  it('deleted_at のような列名は書き込みとみなさない', async () => {
    const result = await runReadOnlyQuery(
      {url, authToken: ''},
      "SELECT uid AS deleted_at, year AS created FROM films WHERE uid = 'a'",
    );

    expect(result.rows).toEqual([['a', 2015]]);
  });

  it('複数文を拒否する', async () => {
    await expect(
      runReadOnlyQuery(
        {url, authToken: ''},
        "SELECT 1; INSERT INTO films VALUES ('c', 'x', 2000)",
      ),
    ).rejects.toThrow(/1 文だけ/);
    expect(await countRows()).toBe(2);
  });
});

describe('formatQueryResult', () => {
  const result = {
    columns: ['uid', 'title', 'year'],
    rows: [
      ['a', 'さざなみ', 2015],
      ['b', 'Delete Me', null],
    ],
  };

  it('既定はタブ区切りで見出し行を付け、NULL は NULL と書く', () => {
    expect(formatQueryResult(result, 'tsv')).toBe(
      ['uid\ttitle\tyear', 'a\tさざなみ\t2015', 'b\tDelete Me\tNULL'].join(
        '\n',
      ),
    );
  });

  it('json は列名をキーにしたオブジェクトの配列にする', () => {
    expect(JSON.parse(formatQueryResult(result, 'json'))).toEqual([
      {uid: 'a', title: 'さざなみ', year: 2015},
      {uid: 'b', title: 'Delete Me', year: null},
    ]);
  });

  it('行が無いときは見出しだけ出す', () => {
    expect(formatQueryResult({columns: ['n'], rows: []}, 'tsv')).toBe('n');
  });
});

const proxyReturning = (rows: unknown[][], sent: unknown[]): typeof fetch =>
  (async (_input: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return Response.json({rows});
  }) as typeof fetch;

describe('runReadOnlyQueryOnD1', () => {
  it('proxy の見出し行を列名にして返す', async () => {
    const result = await runReadOnlyQueryOnD1(
      {
        url: 'https://proxy.test',
        key: 'k',
        fetch: proxyReturning(
          [
            ['uid', 'year'],
            ['a', 2015],
          ],
          [],
        ),
      },
      'SELECT uid, year FROM films',
    );

    expect(result).toEqual({columns: ['uid', 'year'], rows: [['a', 2015]]});
  });

  it('書き込みの文は proxy に送らない', async () => {
    const sent: unknown[] = [];

    await expect(
      runReadOnlyQueryOnD1(
        {url: 'https://proxy.test', key: 'k', fetch: proxyReturning([], sent)},
        "DELETE FROM films WHERE uid = 'a'",
      ),
    ).rejects.toThrow();

    expect(sent).toEqual([]);
  });
});
