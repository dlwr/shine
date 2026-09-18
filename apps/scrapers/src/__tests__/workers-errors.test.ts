import {describe, expect, it, vi} from 'vitest';
import {
  evaluateWorkerErrors,
  fetchWorkerInvocations,
  type WorkerInvocations,
} from '../workers-errors';

const credentials = {token: 'test-token', account: 'test-account'};

function invocationsResponse(
  scripts: Array<{scriptName: string; requests: number; errors: number}>,
): Response {
  return Response.json({
    data: {
      viewer: {
        accounts: [
          {
            workersInvocationsAdaptive: scripts.map(script => ({
              dimensions: {scriptName: script.scriptName},
              sum: {requests: script.requests, errors: script.errors},
            })),
          },
        ],
      },
    },
  });
}

describe('evaluateWorkerErrors', () => {
  const clean: WorkerInvocations[] = [
    {scriptName: 'shine-api', requests: 20_000, errors: 0},
    {scriptName: 'shine-front', requests: 10_000, errors: 0},
  ];

  it('エラーが 1 件も無ければ警告しない', () => {
    expect(evaluateWorkerErrors(clean, 6).alerts).toStrictEqual([]);
  });

  it('エラーがあれば worker ごとに警告する', () => {
    const {alerts} = evaluateWorkerErrors(
      [{scriptName: 'shine-api', requests: 1000, errors: 3}],
      6,
    );

    expect(alerts).toStrictEqual([
      'shine-api が直近6時間で 3 件失敗（1,000 リクエスト中 0.30%）',
    ]);
  });

  it('リクエストが 0 でもエラーがあれば警告する', () => {
    const {alerts} = evaluateWorkerErrors(
      [{scriptName: 'shine-og', requests: 0, errors: 2}],
      6,
    );

    expect(alerts).toStrictEqual([
      'shine-og が直近6時間で 2 件失敗（0 リクエスト中 0.00%）',
    ]);
  });

  it('まとめは worker ごとの件数を1行で出す', () => {
    expect(evaluateWorkerErrors(clean, 6).summary).toBe(
      'Workers 直近6時間: shine-api 20,000 req / 0 err、shine-front 10,000 req / 0 err',
    );
  });

  it('応答が空ならまとめでそう言う', () => {
    expect(evaluateWorkerErrors([], 6)).toStrictEqual({
      alerts: [],
      summary: 'Workers 直近6時間: 記録が無い',
    });
  });
});

describe('fetchWorkerInvocations', () => {
  it('worker ごとのリクエスト数とエラー数を返す', async () => {
    const fetchImpl = vi.fn(async () =>
      invocationsResponse([{scriptName: 'shine-api', requests: 12, errors: 1}]),
    );

    const result = await fetchWorkerInvocations(
      credentials,
      new Date('2026-09-18T00:00:00.000Z'),
      new Date('2026-09-18T06:00:00.000Z'),
      fetchImpl,
    );

    expect(result).toStrictEqual([
      {scriptName: 'shine-api', requests: 12, errors: 1},
    ]);
  });

  it('問い合わせる窓を filter に入れる', async () => {
    const fetchImpl = vi.fn(async () => invocationsResponse([]));

    await fetchWorkerInvocations(
      credentials,
      new Date('2026-09-18T00:00:00.000Z'),
      new Date('2026-09-18T06:00:00.000Z'),
      fetchImpl,
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const {query} = JSON.parse(init.body as string) as {query: string};
    expect(query).toContain('2026-09-18T00:00:00.000Z');
    expect(query).toContain('2026-09-18T06:00:00.000Z');
  });

  it('GraphQL がエラーを返したら投げる', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({errors: [{message: 'Authentication error'}]}),
    );

    await expect(
      fetchWorkerInvocations(credentials, new Date(), new Date(), fetchImpl),
    ).rejects.toThrow('Authentication error');
  });

  it('HTTP が失敗したら投げる', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', {status: 403}));

    await expect(
      fetchWorkerInvocations(credentials, new Date(), new Date(), fetchImpl),
    ).rejects.toThrow('403');
  });
});
