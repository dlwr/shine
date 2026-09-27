import {describe, expect, it, vi} from 'vitest';
import {EdgeCache} from '../cache';

describe('EdgeCache without KV', () => {
  it('KV が無ければ保存せず undefined を返す', async () => {
    const cache = new EdgeCache();
    await cache.set('selections:daily:2024-06-24:en:v1', {title: 'Movie'}, 60);

    expect(
      await cache.get('selections:daily:2024-06-24:en:v1'),
    ).toBeUndefined();
  });
});

function createKvStub() {
  const store = new Map<string, {value: string; expirationTtl?: number}>();
  return {
    store,
    async get(key: string) {
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
}

describe('EdgeCache with KV backend', () => {
  it('stores and returns data through KV', async () => {
    const kv = createKvStub();
    const cache = new EdgeCache(kv as unknown as KVNamespace);

    await cache.set('kv:key', {value: 42}, 600);
    const cached = await cache.get('kv:key');

    expect(cached?.data).toEqual({value: 42});
  });

  it('passes the TTL to KV as expirationTtl', async () => {
    const kv = createKvStub();
    const cache = new EdgeCache(kv as unknown as KVNamespace);

    await cache.set('kv:ttl', {value: 1}, 600);

    expect(kv.store.get('kv:ttl')?.expirationTtl).toBe(600);
  });

  it('returns undefined for keys that were never set', async () => {
    const kv = createKvStub();
    const cache = new EdgeCache(kv as unknown as KVNamespace);

    expect(await cache.get('kv:none')).toBeUndefined();
  });

  it('deletes cached entries', async () => {
    const kv = createKvStub();
    const cache = new EdgeCache(kv as unknown as KVNamespace);

    await cache.set('kv:gone', {value: 1}, 600);
    await cache.delete('kv:gone');

    expect(await cache.get('kv:gone')).toBeUndefined();
  });
});

describe('EdgeCache KV reads', () => {
  it('reads KV as json without an edge TTL by default', async () => {
    const get = vi.fn().mockResolvedValue(undefined);
    const cache = new EdgeCache({get} as unknown as KVNamespace);

    await cache.get('awards:list:v20');

    expect(get).toHaveBeenCalledWith('awards:list:v20', 'json');
  });

  it('lets the colo keep the value for the given edge TTL', async () => {
    const get = vi.fn().mockResolvedValue(undefined);
    const cache = new EdgeCache({get} as unknown as KVNamespace);

    await cache.get('awards:list:v20', {edgeTtl: 600});

    expect(get).toHaveBeenCalledWith('awards:list:v20', {
      type: 'json',
      cacheTtl: 600,
    });
  });
});
