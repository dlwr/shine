import {describe, expect, it, vi} from 'vitest';
import {
  fetchJapanPageTraffic,
  formatLeadingIndicator,
  leadingIndicatorReport,
  leadingIndicatorWindow,
  type PageTraffic,
} from '../web-analytics';

const credentials = {token: 'token', account: 'account', siteTag: 'site'};

function trafficResponse(
  rows: Array<{path: string; pageviews: number; visits: number}>,
): Response {
  return Response.json(
    {
      data: {
        viewer: {
          accounts: [
            {
              rumPageloadEventsAdaptiveGroups: rows.map(row => ({
                count: row.pageviews,
                sum: {visits: row.visits},
                dimensions: {requestPath: row.path},
              })),
            },
          ],
        },
      },
    },
    {status: 200},
  );
}

describe('leadingIndicatorWindow', () => {
  it('7 日の崖を踏まないよう、直近 7 日から 1 時間縮めた窓にする', () => {
    const now = new Date('2026-09-22T09:00:00.000Z');

    expect(leadingIndicatorWindow(now)).toStrictEqual({
      from: new Date('2026-09-15T10:00:00.000Z'),
      to: now,
    });
  });
});

describe('fetchJapanPageTraffic', () => {
  it('パスごとの PV と訪問を返す', async () => {
    const fetchImpl = vi.fn(async () =>
      trafficResponse([
        {path: '/', pageviews: 60, visits: 20},
        {path: '/quiz', pageviews: 40, visits: 10},
      ]),
    );

    const result = await fetchJapanPageTraffic(
      credentials,
      new Date('2026-09-15T00:00:00.000Z'),
      new Date('2026-09-22T00:00:00.000Z'),
      fetchImpl,
    );

    expect(result).toStrictEqual([
      {path: '/', pageviews: 60, visits: 20},
      {path: '/quiz', pageviews: 40, visits: 10},
    ]);
  });

  it('日本からの人の閲覧に絞り、窓を filter に入れる', async () => {
    const fetchImpl = vi.fn(async () =>
      trafficResponse([{path: '/', pageviews: 1, visits: 1}]),
    );

    await fetchJapanPageTraffic(
      credentials,
      new Date('2026-09-15T00:00:00.000Z'),
      new Date('2026-09-22T00:00:00.000Z'),
      fetchImpl,
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const {query} = JSON.parse(init.body as string) as {query: string};
    expect(query).toContain('siteTag: "site"');
    expect(query).toContain('countryName: "JP"');
    expect(query).toContain('bot: 0');
    expect(query).toContain('2026-09-15T00:00:00.000Z');
    expect(query).toContain('2026-09-22T00:00:00.000Z');
  });

  it('GraphQL のエラーを例外にする', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        {errors: [{message: 'unauthorized'}]},
        {
          status: 200,
        },
      ),
    );

    await expect(
      fetchJapanPageTraffic(
        credentials,
        new Date('2026-09-15T00:00:00.000Z'),
        new Date('2026-09-22T00:00:00.000Z'),
        fetchImpl,
      ),
    ).rejects.toThrow('unauthorized');
  });

  it('accounts の無い応答は空応答として例外にする', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({data: {viewer: {accounts: []}}}, {status: 200}),
    );

    await expect(
      fetchJapanPageTraffic(
        credentials,
        new Date('2026-09-15T00:00:00.000Z'),
        new Date('2026-09-22T00:00:00.000Z'),
        fetchImpl,
      ),
    ).rejects.toThrow('空応答');
  });

  it('記録が 0 件の応答も空応答として例外にする', async () => {
    const fetchImpl = vi.fn(async () => trafficResponse([]));

    await expect(
      fetchJapanPageTraffic(
        credentials,
        new Date('2026-09-15T00:00:00.000Z'),
        new Date('2026-09-22T00:00:00.000Z'),
        fetchImpl,
      ),
    ).rejects.toThrow('空応答');
  });

  it('HTTP エラーを例外にする', async () => {
    const fetchImpl = vi.fn(async () => new Response('', {status: 500}));

    await expect(
      fetchJapanPageTraffic(
        credentials,
        new Date('2026-09-15T00:00:00.000Z'),
        new Date('2026-09-22T00:00:00.000Z'),
        fetchImpl,
      ),
    ).rejects.toThrow('HTTP 500');
  });
});

describe('leadingIndicatorReport', () => {
  const now = new Date('2026-09-22T09:00:00.000Z');

  it('空応答なら 1 回だけやり直す', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(trafficResponse([]))
      .mockResolvedValueOnce(
        trafficResponse([{path: '/', pageviews: 3, visits: 1}]),
      );

    const report = await leadingIndicatorReport(
      credentials,
      [],
      now,
      fetchImpl,
    );

    expect(report).toContain('全体: PV 3 / 訪問 1');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('2 回とも空応答なら例外にする', async () => {
    const fetchImpl = vi.fn(async () => trafficResponse([]));

    await expect(
      leadingIndicatorReport(credentials, [], now, fetchImpl),
    ).rejects.toThrow('空応答');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('formatLeadingIndicator', () => {
  const traffic: PageTraffic[] = [
    {path: '/', pageviews: 60, visits: 20},
    {path: '/quiz', pageviews: 40, visits: 10},
    {path: '/admin/movies/selections', pageviews: 14, visits: 3},
    {path: '/movies/sep', pageviews: 9, visits: 1},
    {path: '/people', pageviews: 5, visits: 2},
  ];
  const window = {
    from: new Date('2026-09-15T10:00:00.000Z'),
    to: new Date('2026-09-22T09:00:00.000Z'),
  };
  const picks = [
    {month: '2026-09', title: 'ぬいぐるみ', path: '/movies/sep'},
    {month: '2026-08', title: 'リアリティー', path: '/movies/aug'},
  ];

  it('見出しに窓を JST で出す', () => {
    const [heading] = formatLeadingIndicator(traffic, picks, window).split(
      '\n',
      1,
    );

    expect(heading).toBe(
      '先行指標（国=Japan・bot と /admin 除外、2026-09-15 19:00 〜 2026-09-22 18:00 JST）',
    );
  });

  it('全体の PV と訪問はパスごとの値を足す', () => {
    expect(formatLeadingIndicator(traffic, picks, window)).toContain(
      '全体: PV 114 / 訪問 33',
    );
  });

  it('月替わりの映画ページを月ごとに出す', () => {
    expect(formatLeadingIndicator(traffic, picks, window)).toContain(
      '2026-09 ぬいぐるみ: PV 9 / 訪問 1',
    );
  });

  it('記録の無い映画ページは 0 にする', () => {
    expect(formatLeadingIndicator(traffic, picks, window)).toContain(
      '2026-08 リアリティー: PV 0 / 訪問 0',
    );
  });

  it('/admin 配下は本人の操作なので全体にも上位にも数えない', () => {
    const report = formatLeadingIndicator(traffic, picks, window);

    expect(report).toContain('全体: PV 114 / 訪問 33');
    expect(report).toContain(
      '上位のパス: / 60、/quiz 40、/movies/sep 9、/people 5',
    );
  });

  it('入口の上位を PV 順に出す', () => {
    expect(formatLeadingIndicator(traffic, picks, window, 3)).toContain(
      '上位のパス: / 60、/quiz 40、/movies/sep 9',
    );
  });

  it('値が全部 10 の倍数ならサンプル値だと注記する', () => {
    const sampled: PageTraffic[] = [
      {path: '/', pageviews: 60, visits: 20},
      {path: '/quiz', pageviews: 40, visits: 10},
    ];

    expect(formatLeadingIndicator(sampled, picks, window)).toContain(
      '（値が全部 10 の倍数なのでサンプル推定の可能性がある）',
    );
  });

  it('記録が無ければその旨を出す', () => {
    expect(formatLeadingIndicator([], picks, window)).toContain(
      '全体: PV 0 / 訪問 0',
    );
  });
});
