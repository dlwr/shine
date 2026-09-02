import {describe, expect, it} from 'vitest';
import {
  billingCycle,
  evaluateTursoUsage,
  fetchRowsRead,
  formatRows,
} from '../turso-usage';

const LIMIT = 100_000_000_000;
const NOW = new Date('2026-09-02T01:00:00Z');

describe('evaluateTursoUsage', () => {
  it('直近24時間の読み取りが閾値を超えると警告する', () => {
    const result = evaluateTursoUsage(
      {
        last24hRowsRead: 18_000_000_000,
        monthToDateRowsRead: 19_000_000_000,
        now: NOW,
      },
      LIMIT,
    );

    expect(result.alerts).toContain(
      '直近24時間の読み取りが 18.0B 行（閾値 1.0B）',
    );
  });

  it('月累計が上限の80%に達すると警告する', () => {
    const result = evaluateTursoUsage(
      {
        last24hRowsRead: 100_000_000,
        monthToDateRowsRead: 80_200_000_000,
        now: NOW,
      },
      LIMIT,
    );

    expect(result.alerts).toContain('月累計が 80.2B / 100.0B（80%）に達した');
  });

  it('直近24時間のペースで月末までに上限を超えると警告する', () => {
    const result = evaluateTursoUsage(
      {
        last24hRowsRead: 2_000_000_000,
        monthToDateRowsRead: 50_000_000_000,
        now: NOW,
      },
      LIMIT,
    );

    expect(result.alerts).toContain(
      'このペースでは月末までに上限を超える（予測 107.9B / 100.0B）',
    );
  });

  it('平常時は警告を出さない', () => {
    const result = evaluateTursoUsage(
      {
        last24hRowsRead: 120_000_000,
        monthToDateRowsRead: 69_500_000_000,
        now: NOW,
      },
      LIMIT,
    );

    expect(result.alerts).toEqual([]);
  });

  it('サマリに直近24時間・月累計・月末予測を入れる', () => {
    const result = evaluateTursoUsage(
      {
        last24hRowsRead: 120_000_000,
        monthToDateRowsRead: 69_500_000_000,
        now: NOW,
      },
      LIMIT,
    );

    expect(result.summary).toBe(
      'Turso 読み取り: 直近24h 120M / 月累計 69.5B / 100.0B（70%） / 月末予測 73.0B（残り 29.0 日）',
    );
  });
});

describe('billingCycle', () => {
  it('UTC の月初から翌月初までを返す', () => {
    expect(billingCycle(NOW)).toEqual({
      start: new Date('2026-09-01T00:00:00Z'),
      end: new Date('2026-10-01T00:00:00Z'),
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

describe('fetchRowsRead', () => {
  it('組織の利用量 API を期間つきで叩いて rows_read を返す', async () => {
    const calls: Array<{url: string; headers: Record<string, string>}> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({url, headers: init?.headers as Record<string, string>});
      return Response.json({
        organization: {usage: {rows_read: 443_899_702_327}},
      });
    }) as unknown as typeof fetch;

    const rows = await fetchRowsRead(
      {token: 'tok', organization: 'dlwr'},
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-09-02T00:00:00Z'),
      fetchImpl,
    );

    expect(rows).toBe(443_899_702_327);
    expect(calls[0].url).toBe(
      'https://api.turso.tech/v1/organizations/dlwr/usage?from=2026-08-01T00%3A00%3A00.000Z&to=2026-09-02T00%3A00%3A00.000Z',
    );
    expect(calls[0].headers.Authorization).toBe('Bearer tok');
  });

  it('API が失敗したら例外にする', async () => {
    const fetchImpl = (async () =>
      new Response('nope', {status: 401})) as unknown as typeof fetch;

    await expect(
      fetchRowsRead(
        {token: 'tok', organization: 'dlwr'},
        new Date('2026-08-01T00:00:00Z'),
        new Date('2026-09-02T00:00:00Z'),
        fetchImpl,
      ),
    ).rejects.toThrow('401');
  });
});
