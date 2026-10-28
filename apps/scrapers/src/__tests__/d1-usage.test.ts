import {describe, expect, it} from 'vitest';
import {
  billingCycle,
  evaluateD1Usage,
  fetchD1Usage,
  fetchTopD1Queries,
  formatRows,
  formatTopD1Queries,
  recurringTopQueries,
} from '../d1-usage';

const NOW = new Date('2026-10-02T01:00:00Z');

const quiet = {
  lastHourRowsRead: 1_000_000,
  last24hRowsRead: 20_000_000,
  monthToDateRowsRead: 30_000_000,
  monthToDateRowsWritten: 50_000,
  now: NOW,
};

describe('evaluateD1Usage', () => {
  it('直近1時間の読み取りが閾値を超えると警告する', () => {
    const result = evaluateD1Usage({...quiet, lastHourRowsRead: 1_300_000_000});

    expect(result.alerts).toContain(
      '直近1時間の読み取りが 1.3B 行（閾値 100M）',
    );
  });

  it('月累計の読み取りが込みの枠の80%に達すると警告する', () => {
    const result = evaluateD1Usage({
      ...quiet,
      monthToDateRowsRead: 20_000_000_000,
    });

    expect(result.alerts).toContain(
      '読み取りの月累計が 20.0B / 25.0B（80%）に達した',
    );
  });

  it('直近24時間のペースで月末までに読み取りの枠を超えると警告する', () => {
    const result = evaluateD1Usage({...quiet, last24hRowsRead: 900_000_000});

    expect(result.alerts).toContain(
      'このペースでは月末までに読み取りの枠を超える（予測 27.0B / 25.0B）',
    );
  });

  it('月累計の書き込みが込みの枠の80%に達すると警告する', () => {
    const result = evaluateD1Usage({
      ...quiet,
      monthToDateRowsWritten: 40_000_000,
    });

    expect(result.alerts).toContain(
      '書き込みの月累計が 40M / 50M（80%）に達した',
    );
  });

  it('平常なら警告しない', () => {
    expect(evaluateD1Usage(quiet).alerts).toEqual([]);
  });
});

const respond = (sum: Record<string, number>) =>
  (async () =>
    Response.json({
      data: {viewer: {accounts: [{d1AnalyticsAdaptiveGroups: [{sum}]}]}},
    })) as unknown as typeof fetch;

describe('fetchD1Usage', () => {
  it('期間の読み取り行数の合計を返す', async () => {
    const usage = await fetchD1Usage(
      {token: 't', account: 'a'},
      'db',
      NOW,
      NOW,
      respond({rowsRead: 123, rowsWritten: 4}),
    );

    expect(usage.rowsRead).toBe(123);
  });

  it('期間に記録が無ければ 0 を返す', async () => {
    const empty = (async () =>
      Response.json({
        data: {viewer: {accounts: [{d1AnalyticsAdaptiveGroups: []}]}},
      })) as unknown as typeof fetch;

    const usage = await fetchD1Usage(
      {token: 't', account: 'a'},
      'db',
      NOW,
      NOW,
      empty,
    );

    expect(usage).toEqual({rowsRead: 0, rowsWritten: 0});
  });

  it('GraphQL のエラーを例外にする', async () => {
    const failing = (async () =>
      Response.json({
        errors: [{message: 'not authorized'}],
      })) as unknown as typeof fetch;

    await expect(
      fetchD1Usage({token: 't', account: 'a'}, 'db', NOW, NOW, failing),
    ).rejects.toThrow('not authorized');
  });
});

describe('fetchTopD1Queries', () => {
  it('読み取り行数の多い順に文ごとの読み取り・回数・所要時間を返す', async () => {
    const groups = [
      {
        count: 10,
        sum: {rowsRead: 500, queryDurationMs: 25},
        dimensions: {query: 'select 1'},
      },
    ];
    const fetchImpl = (async () =>
      Response.json({
        data: {viewer: {accounts: [{d1QueriesAdaptiveGroups: groups}]}},
      })) as unknown as typeof fetch;

    const queries = await fetchTopD1Queries(
      {token: 't', account: 'a'},
      'db',
      NOW,
      NOW,
      5,
      fetchImpl,
    );

    expect(queries).toEqual([
      {query: 'select 1', rowsRead: 500, count: 10, durationMs: 25},
    ]);
  });

  it('GraphQL のエラーを例外にする', async () => {
    const failing = (async () =>
      Response.json({
        errors: [{message: 'not authorized'}],
      })) as unknown as typeof fetch;

    await expect(
      fetchTopD1Queries({token: 't', account: 'a'}, 'db', NOW, NOW, 5, failing),
    ).rejects.toThrow('not authorized');
  });
});

describe('formatTopD1Queries', () => {
  it('読み取り行数・全体に占める割合・回数・1 回あたりの行数・平均の所要時間と文の頭を 1 行に出す', () => {
    const text = formatTopD1Queries(
      [
        {
          query: 'select "uid"\n  from   movies',
          rowsRead: 5_000_000,
          count: 1000,
          durationMs: 2000,
        },
      ],
      20_000_000,
    );

    expect(text).toBe(
      '5M（25%）  1000 回  5000 行/回  平均 2ms  select "uid" from movies',
    );
  });

  it('長い文は 100 字で切る', () => {
    const text = formatTopD1Queries(
      [{query: 'x'.repeat(150), rowsRead: 1, count: 1, durationMs: 1}],
      1,
    );

    expect(text.endsWith(`${'x'.repeat(100)}…`)).toBe(true);
  });
});

const stat = (query: string, count: number) => ({
  query,
  rowsRead: 100,
  count,
  durationMs: 1,
});

describe('recurringTopQueries', () => {
  it('1 回しか走っていない文を除いて上から指定の本数を返す', () => {
    const result = recurringTopQueries(
      [
        stat('select a', 3),
        stat('select adhoc', 1),
        stat('select b', 2),
        stat('select c', 5),
      ],
      2,
    );

    expect(result.recurring.map(({query}) => query)).toEqual([
      'select a',
      'select b',
    ]);
  });

  it('除いた 1 回きりの文を返す', () => {
    const result = recurringTopQueries(
      [stat('select a', 3), stat('select adhoc', 1)],
      2,
    );

    expect(result.excluded.map(({query}) => query)).toEqual(['select adhoc']);
  });

  it('drizzle の出す小文字で始まらない文は手で流した文として除く', () => {
    const result = recurringTopQueries(
      [
        stat('SELECT mc.person_uid FROM movie_credits mc', 4),
        stat('select "uid" from "movies"', 3),
      ],
      5,
    );

    expect(result.excluded.map(({query}) => query)).toEqual([
      'SELECT mc.person_uid FROM movie_credits mc',
    ]);
  });
});

describe('billingCycle', () => {
  it('UTC の月初から翌月初までを返す', () => {
    expect(billingCycle(NOW)).toEqual({
      start: new Date('2026-10-01T00:00:00Z'),
      end: new Date('2026-11-01T00:00:00Z'),
    });
  });
});

describe('formatRows', () => {
  it('10億以上は B で小数1桁にする', () => {
    expect(formatRows(69_421_600_000)).toBe('69.4B');
  });

  it('100万以上10億未満は M で整数にする', () => {
    expect(formatRows(120_400_000)).toBe('120M');
  });

  it('100万未満はそのまま出す', () => {
    expect(formatRows(4303)).toBe('4303');
  });
});
