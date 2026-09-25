import {describe, expect, it} from 'vitest';
import {evaluateD1Usage, fetchD1Usage} from '../d1-usage';

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
