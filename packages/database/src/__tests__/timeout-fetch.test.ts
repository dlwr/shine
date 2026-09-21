import {afterEach, describe, expect, it, vi} from 'vitest';
import {createTimeoutFetch, resolveRequestTimeout} from '../timeout-fetch';

function hangingFetch() {
  return vi.fn(
    async (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason as Error);
        });
      }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createTimeoutFetch', () => {
  it('応答が返らなければ時間切れで打ち切る', async () => {
    vi.stubGlobal('fetch', hangingFetch());

    await expect(
      createTimeoutFetch(20)('https://db.example/v2/pipeline'),
    ).rejects.toMatchObject({name: 'TimeoutError'});
  });

  it('時間内に返った応答はそのまま返す', async () => {
    const response = new Response('ok');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );

    await expect(
      createTimeoutFetch(1000)('https://db.example/v2/pipeline'),
    ).resolves.toBe(response);
  });

  it('呼び出し側の指定を保ったまま fetch に渡す', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    await createTimeoutFetch(1000)('https://db.example/v2/pipeline', {
      method: 'POST',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://db.example/v2/pipeline',
      expect.objectContaining({method: 'POST'}),
    );
  });
});

describe('resolveRequestTimeout', () => {
  it('設定が無ければタイムアウトを付けない', () => {
    expect(resolveRequestTimeout(undefined)).toBeUndefined();
  });

  it('ミリ秒の文字列を数値にする', () => {
    expect(resolveRequestTimeout('10000')).toBe(10_000);
  });

  it('数値として読めない設定は無視する', () => {
    expect(resolveRequestTimeout('ten seconds')).toBeUndefined();
  });

  it('0 以下の設定は無視する', () => {
    expect(resolveRequestTimeout('0')).toBeUndefined();
  });
});
