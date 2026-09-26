import {describe, expect, it, vi} from 'vitest';
import {EdgeCache} from '../cache';
import {readThroughCache, STALE_RETENTION} from '../read-through-cache';

const TTL = 600;
const KEY = 'years:list:v3';

type StoredEntry = {value: string; expirationTtl?: number};

function createKvStub() {
  const store = new Map<string, StoredEntry>();
  const getOptions: unknown[] = [];
  const kv = {
    async get(key: string, options: unknown) {
      getOptions.push(options);
      const entry = store.get(key);
      return entry ? (JSON.parse(entry.value) as unknown) : null;
    },
    async put(key: string, value: string, options?: {expirationTtl?: number}) {
      store.set(key, {value, expirationTtl: options?.expirationTtl});
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
  return {kv: kv as unknown as KVNamespace, store, getOptions};
}

function createContext() {
  const pending: Array<Promise<unknown>> = [];
  return {
    context: {
      executionCtx: {
        waitUntil(promise: Promise<unknown>) {
          pending.push(promise);
        },
      },
    } as unknown as Parameters<typeof readThroughCache>[0],
    async settle() {
      await Promise.all(pending);
    },
  };
}

function seed(
  store: Map<string, StoredEntry>,
  data: unknown,
  ageInSeconds: number,
) {
  store.set(KEY, {
    value: JSON.stringify({data, cachedAt: Date.now() - ageInSeconds * 1000}),
  });
}

function storedData(store: Map<string, StoredEntry>): unknown {
  const entry = store.get(KEY);
  return entry ? (JSON.parse(entry.value) as {data: unknown}).data : undefined;
}

describe('readThroughCache: キャッシュに無いとき', () => {
  it('読み込んだ値を返す', async () => {
    const {kv} = createKvStub();
    const {context} = createContext();

    const result = await readThroughCache(
      context,
      new EdgeCache(undefined, kv),
      {
        key: KEY,
        ttl: TTL,
        load: async () => ({years: [2024]}),
      },
    );

    expect(result.data).toEqual({years: [2024]});
  });

  it('MISS と報告する', async () => {
    const {kv} = createKvStub();
    const {context} = createContext();

    const result = await readThroughCache(
      context,
      new EdgeCache(undefined, kv),
      {
        key: KEY,
        ttl: TTL,
        load: async () => ({years: [2024]}),
      },
    );

    expect(result.status).toBe('MISS');
  });

  it('読み込んだ値を書き込む', async () => {
    const {kv, store} = createKvStub();
    const {context, settle} = createContext();

    await readThroughCache(context, new EdgeCache(undefined, kv), {
      key: KEY,
      ttl: TTL,
      load: async () => ({years: [2024]}),
    });
    await settle();

    expect(storedData(store)).toEqual({years: [2024]});
  });

  it('期限を過ぎても古い値を返せるよう、TTL より長く残す', async () => {
    const {kv, store} = createKvStub();
    const {context, settle} = createContext();

    await readThroughCache(context, new EdgeCache(undefined, kv), {
      key: KEY,
      ttl: TTL,
      load: async () => ({years: [2024]}),
    });
    await settle();

    expect(store.get(KEY)?.expirationTtl).toBe(TTL + STALE_RETENTION);
  });

  it('読み込みが 1 回失敗しても、やり直して値を返す', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {kv} = createKvStub();
    const {context} = createContext();
    const load = vi
      .fn<() => Promise<{years: number[]}>>()
      .mockRejectedValueOnce(new Error('database timed out'))
      .mockResolvedValueOnce({years: [2024]});

    const result = await readThroughCache(
      context,
      new EdgeCache(undefined, kv),
      {key: KEY, ttl: TTL, load},
    );

    expect(result.data).toEqual({years: [2024]});
  });

  it('やり直すとき、元になったエラーをログに出す', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const {kv} = createKvStub();
    const {context} = createContext();
    const cause = new DOMException('The operation timed out', 'TimeoutError');
    const load = vi
      .fn<() => Promise<{years: number[]}>>()
      .mockRejectedValueOnce(new Error('Failed query', {cause}))
      .mockResolvedValueOnce({years: [2024]});

    await readThroughCache(context, new EdgeCache(undefined, kv), {
      key: KEY,
      ttl: TTL,
      load,
    });

    expect(log).toHaveBeenCalledWith(
      'Caused by:',
      'TimeoutError: The operation timed out',
    );
  });

  it('やり直しは 1 回だけにする', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {kv} = createKvStub();
    const {context} = createContext();
    const load = vi
      .fn<() => Promise<{years: number[]}>>()
      .mockRejectedValue(new Error('database timed out'));

    await expect(
      readThroughCache(context, new EdgeCache(undefined, kv), {
        key: KEY,
        ttl: TTL,
        load,
      }),
    ).rejects.toThrow();

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('2 回続けて失敗したら、最後のエラーを投げる', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {kv} = createKvStub();
    const {context} = createContext();

    await expect(
      readThroughCache(context, new EdgeCache(undefined, kv), {
        key: KEY,
        ttl: TTL,
        async load() {
          throw new Error('database is down');
        },
      }),
    ).rejects.toThrow('database is down');
  });

  it('見つからなかった結果は書き込まない', async () => {
    const {kv, store} = createKvStub();
    const {context, settle} = createContext();

    await readThroughCache(context, new EdgeCache(undefined, kv), {
      key: KEY,
      ttl: TTL,
      load: async () => {},
    });
    await settle();

    expect(store.has(KEY)).toBe(false);
  });
});

describe('readThroughCache: 期限内の値があるとき', () => {
  it('キャッシュの値を返す', async () => {
    const {kv, store} = createKvStub();
    const {context} = createContext();
    seed(store, {years: [1999]}, TTL - 1);

    const result = await readThroughCache(
      context,
      new EdgeCache(undefined, kv),
      {
        key: KEY,
        ttl: TTL,
        load: async () => ({years: [2024]}),
      },
    );

    expect(result.data).toEqual({years: [1999]});
  });

  it('HIT と報告する', async () => {
    const {kv, store} = createKvStub();
    const {context} = createContext();
    seed(store, {years: [1999]}, TTL - 1);

    const result = await readThroughCache(
      context,
      new EdgeCache(undefined, kv),
      {
        key: KEY,
        ttl: TTL,
        load: async () => ({years: [2024]}),
      },
    );

    expect(result.status).toBe('HIT');
  });

  it('読み込み直さない', async () => {
    const {kv, store} = createKvStub();
    const {context, settle} = createContext();
    seed(store, {years: [1999]}, TTL - 1);
    const load = vi.fn(async () => ({years: [2024]}));

    await readThroughCache(context, new EdgeCache(undefined, kv), {
      key: KEY,
      ttl: TTL,
      load,
    });
    await settle();

    expect(load).not.toHaveBeenCalled();
  });

  it('colo に持たせる秒数を KV の読み取りに渡す', async () => {
    const {kv, store, getOptions} = createKvStub();
    const {context} = createContext();
    seed(store, {years: [1999]}, TTL - 1);

    await readThroughCache(context, new EdgeCache(undefined, kv), {
      key: KEY,
      ttl: TTL,
      edgeTtl: 600,
      load: async () => ({years: [2024]}),
    });

    expect(getOptions).toEqual([{type: 'json', cacheTtl: 600}]);
  });
});

describe('readThroughCache: 期限を過ぎた値があるとき', () => {
  it('待たせずに古い値を返す', async () => {
    const {kv, store} = createKvStub();
    const {context} = createContext();
    seed(store, {years: [1999]}, TTL + 1);

    const result = await readThroughCache(
      context,
      new EdgeCache(undefined, kv),
      {
        key: KEY,
        ttl: TTL,
        load: async () => ({years: [2024]}),
      },
    );

    expect(result.data).toEqual({years: [1999]});
  });

  it('STALE と報告する', async () => {
    const {kv, store} = createKvStub();
    const {context} = createContext();
    seed(store, {years: [1999]}, TTL + 1);

    const result = await readThroughCache(
      context,
      new EdgeCache(undefined, kv),
      {
        key: KEY,
        ttl: TTL,
        load: async () => ({years: [2024]}),
      },
    );

    expect(result.status).toBe('STALE');
  });

  it('応答の後で新しい値に書き換える', async () => {
    const {kv, store} = createKvStub();
    const {context, settle} = createContext();
    seed(store, {years: [1999]}, TTL + 1);

    await readThroughCache(context, new EdgeCache(undefined, kv), {
      key: KEY,
      ttl: TTL,
      load: async () => ({years: [2024]}),
    });
    await settle();

    expect(storedData(store)).toEqual({years: [2024]});
  });

  it('読み込み直しに失敗したら古い値を残す', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {kv, store} = createKvStub();
    const {context, settle} = createContext();
    seed(store, {years: [1999]}, TTL + 1);

    await readThroughCache(context, new EdgeCache(undefined, kv), {
      key: KEY,
      ttl: TTL,
      async load() {
        throw new Error('database is down');
      },
    });
    await settle();

    expect(storedData(store)).toEqual({years: [1999]});
  });

  it('作り直しに失敗したとき、元になったエラーをログに出す', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const {kv, store} = createKvStub();
    const {context, settle} = createContext();
    seed(store, {years: [1999]}, TTL + 1);
    const cause = new DOMException('The operation timed out', 'TimeoutError');

    await readThroughCache(context, new EdgeCache(undefined, kv), {
      key: KEY,
      ttl: TTL,
      async load() {
        throw new Error('Failed query', {cause});
      },
    });
    await settle();

    expect(log).toHaveBeenCalledWith(
      'Caused by:',
      'TimeoutError: The operation timed out',
    );
  });

  it('読み込み直して見つからなければ古い値を消す', async () => {
    const {kv, store} = createKvStub();
    const {context, settle} = createContext();
    seed(store, {years: [1999]}, TTL + 1);

    await readThroughCache(context, new EdgeCache(undefined, kv), {
      key: KEY,
      ttl: TTL,
      load: async () => {},
    });
    await settle();

    expect(store.has(KEY)).toBe(false);
  });
});
