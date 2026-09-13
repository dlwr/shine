import {describe, expect, it} from 'vitest';
import {
  formatPageTimings,
  formatSurveyReport,
  isSurveySourceFile,
  largestSourceFiles,
  measurePages,
} from '../survey';

describe('isSurveySourceFile', () => {
  it('apps 配下の ts を対象にする', () => {
    expect(isSurveySourceFile('apps/api/src/routes/movies.ts')).toBe(true);
  });

  it('packages 配下の tsx を対象にする', () => {
    expect(isSurveySourceFile('packages/utils/src/view.tsx')).toBe(true);
  });

  it('テストファイルを除く', () => {
    expect(isSurveySourceFile('apps/api/src/routes/movies.test.ts')).toBe(
      false,
    );
  });

  it('__tests__ 配下を除く', () => {
    expect(isSurveySourceFile('apps/scrapers/src/__tests__/x.ts')).toBe(false);
  });

  it('型定義ファイルを除く', () => {
    expect(isSurveySourceFile('apps/front/worker-configuration.d.ts')).toBe(
      false,
    );
  });

  it('build 配下を除く', () => {
    expect(isSurveySourceFile('apps/front/build/server/index.ts')).toBe(false);
  });

  it('node_modules 配下を除く', () => {
    expect(isSurveySourceFile('apps/api/node_modules/x/index.ts')).toBe(false);
  });

  it('ts 以外を除く', () => {
    expect(isSurveySourceFile('apps/api/openapi.yml')).toBe(false);
  });
});

describe('largestSourceFiles', () => {
  it('行数の多い順に並べる', () => {
    const files = [
      {path: 'a.ts', lines: 100},
      {path: 'b.ts', lines: 900},
      {path: 'c.ts', lines: 500},
      {path: 'd.ts', lines: 700},
    ];

    expect(largestSourceFiles(files, 10).map(file => file.path)).toEqual([
      'b.ts',
      'd.ts',
      'c.ts',
      'a.ts',
    ]);
  });

  it('上位 N 件に絞る', () => {
    const files = [
      {path: 'a.ts', lines: 100},
      {path: 'b.ts', lines: 900},
      {path: 'c.ts', lines: 500},
    ];

    expect(largestSourceFiles(files, 2).map(file => file.path)).toEqual([
      'b.ts',
      'c.ts',
    ]);
  });
});

describe('measurePages', () => {
  it('ラウンドごとに全ページを順に叩く', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response('ok', {status: 200});
    }) as typeof fetch;

    const rounds = await measurePages(
      'https://example.com',
      ['/', '/quiz'],
      2,
      fetchImpl,
    );

    expect(calls).toEqual([
      'https://example.com/',
      'https://example.com/quiz',
      'https://example.com/',
      'https://example.com/quiz',
    ]);
    expect(rounds).toHaveLength(2);
    expect(rounds[0].map(timing => timing.path)).toEqual(['/', '/quiz']);
  });

  it('ステータスを記録する', async () => {
    const fetchImpl = (async () =>
      new Response('missing', {status: 404})) as typeof fetch;

    const [round] = await measurePages(
      'https://example.com',
      ['/x'],
      1,
      fetchImpl,
    );

    expect(round[0].status).toBe(404);
  });

  it('所要時間をミリ秒で記録する', async () => {
    const fetchImpl = (async () => new Response('ok')) as typeof fetch;

    const [round] = await measurePages(
      'https://example.com',
      ['/'],
      1,
      fetchImpl,
    );

    expect(round[0].ttfbMs).toBeGreaterThanOrEqual(0);
  });
});

describe('formatPageTimings', () => {
  it('ページごとにラウンドの所要時間を並べる', () => {
    const text = formatPageTimings([
      [
        {path: '/', status: 200, ttfbMs: 341.2},
        {path: '/quiz', status: 200, ttfbMs: 80.4},
      ],
      [
        {path: '/', status: 200, ttfbMs: 78.9},
        {path: '/quiz', status: 200, ttfbMs: 75},
      ],
    ]);

    expect(text.split('\n')).toEqual([
      '/      200   341ms    79ms',
      '/quiz  200    80ms    75ms',
    ]);
  });

  it('200 以外のステータスをそのまま出す', () => {
    const text = formatPageTimings([[{path: '/x', status: 404, ttfbMs: 10}]]);

    expect(text).toBe('/x  404    10ms');
  });
});

describe('formatSurveyReport', () => {
  it('節ごとに見出しを付けて空行で区切る', () => {
    const text = formatSurveyReport([
      {title: '本番 TTFB', body: '/  200  10ms'},
      {title: 'Turso', body: '直近24h 26M'},
    ]);

    expect(text).toBe('## 本番 TTFB\n/  200  10ms\n\n## Turso\n直近24h 26M');
  });
});
