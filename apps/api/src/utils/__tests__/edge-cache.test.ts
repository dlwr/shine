import {beforeEach, describe, expect, it} from 'vitest';
import {EdgeCache} from '../cache';

function createStatefulCacheStub() {
  const store = new Map<string, Response>();
  return {
    async match(key: string) {
      const cached = store.get(key);
      return cached?.clone();
    },
    async put(key: string, response: Response) {
      store.set(key, response);
    },
    async delete(key: string) {
      return store.delete(key);
    },
    async keys() {
      return [...store.keys()].map(key => new Request(`http://cache/${key}`));
    },
  };
}

describe('EdgeCache', () => {
  let cacheStub: ReturnType<typeof createStatefulCacheStub>;

  beforeEach(() => {
    cacheStub = createStatefulCacheStub();
  });

  it('caches and returns data for non-preview keys', async () => {
    const cache = new EdgeCache(cacheStub as unknown as Cache);
    await cache.set('selections:daily:2024-06-24:en:v1', {title: 'Movie'}, 60);

    const cached = await cache.get('selections:daily:2024-06-24:en:v1');

    expect(cached?.data).toEqual({title: 'Movie'});
  });

  it('returns undefined for keys that were never set', async () => {
    const cache = new EdgeCache(cacheStub as unknown as Cache);

    const cached = await cache.get('selections:daily:2024-06-24:en:v1');

    expect(cached).toBeUndefined();
  });

  it('deletes cached entries', async () => {
    const cache = new EdgeCache(cacheStub as unknown as Cache);
    await cache.set('movie:abc:basic:ja:v2', {title: 'Movie'}, 60);

    await cache.delete('movie:abc:basic:ja:v2');

    expect(await cache.get('movie:abc:basic:ja:v2')).toBeUndefined();
  });

  it('keeps entries for different locales separate', async () => {
    const cache = new EdgeCache(cacheStub as unknown as Cache);
    await cache.set('selections:daily:2024-06-24:en:v1', {title: 'Movie'}, 60);
    await cache.set('selections:daily:2024-06-24:ja:v1', {title: '映画'}, 60);

    const en = await cache.get('selections:daily:2024-06-24:en:v1');
    const ja = await cache.get('selections:daily:2024-06-24:ja:v1');

    expect(en?.data).toEqual({title: 'Movie'});
    expect(ja?.data).toEqual({title: '映画'});
  });
});
