import {type Environment} from '@shine/database';
import {beforeEach, describe, expect, it} from 'vitest';
import {STALE_RETENTION} from '../../utils/read-through-cache';
import {QuizService} from '../quiz-service';
import {createEnvironment} from './quiz-pool-fixture';

const POOL_KEY = 'quiz:pool:v3';
const SIZE_KEY = 'quiz:pool:v3:size';
const TTL = 604_800;
const OLD_POOL = [{uid: 'old-movie', title: '古いプールの映画'}];

type StoredEntry = {value: string; expirationTtl?: number};

function createKv() {
  const store = new Map<string, StoredEntry>();
  const kv = {
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
  } as unknown as KVNamespace;
  return {kv, store};
}

function createRequestContext() {
  const pending: Array<Promise<unknown>> = [];
  return {
    requestContext: {
      executionCtx: {
        waitUntil(promise: Promise<unknown>) {
          pending.push(promise);
        },
      },
    } as unknown as ConstructorParameters<typeof QuizService>[1],
    async settle() {
      await Promise.all(pending);
    },
  };
}

function seedExpired(
  store: Map<string, StoredEntry>,
  key: string,
  data: unknown,
) {
  store.set(key, {
    value: JSON.stringify({data, cachedAt: Date.now() - (TTL + 1) * 1000}),
  });
}

function storedData(store: Map<string, StoredEntry>, key: string): unknown {
  const entry = store.get(key);
  return entry ? (JSON.parse(entry.value) as {data: unknown}).data : undefined;
}

describe('出題プールのキャッシュ', () => {
  let environment: Environment;
  let store: Map<string, StoredEntry>;

  beforeEach(async () => {
    ({environment} = await createEnvironment(3));
    const created = createKv();
    environment.CACHE_KV = created.kv;
    store = created.store;
  });

  it('期限を過ぎたプールは、作り直しを待たずに古いまま返す', async () => {
    seedExpired(store, POOL_KEY, OLD_POOL);
    const {requestContext} = createRequestContext();

    const pool = await new QuizService(environment, requestContext).getPool();

    expect(pool).toEqual(OLD_POOL);
  });

  it('期限を過ぎたプールは、応答の後で作り直す', async () => {
    seedExpired(store, POOL_KEY, OLD_POOL);
    const {requestContext, settle} = createRequestContext();

    await new QuizService(environment, requestContext).getPool();
    await settle();

    expect(storedData(store, POOL_KEY)).toHaveLength(3);
  });

  it('プールを作り直したら出題数も書き直す', async () => {
    seedExpired(store, POOL_KEY, OLD_POOL);
    seedExpired(store, SIZE_KEY, 1);
    const {requestContext, settle} = createRequestContext();

    await new QuizService(environment, requestContext).getPool();
    await settle();

    expect(storedData(store, SIZE_KEY)).toBe(3);
  });

  it('プールを TTL より長く残す', async () => {
    await new QuizService(environment).getPool();

    expect(store.get(POOL_KEY)?.expirationTtl).toBe(TTL + STALE_RETENTION);
  });

  it('出題数を TTL より長く残す', async () => {
    await new QuizService(environment).getPool();

    expect(store.get(SIZE_KEY)?.expirationTtl).toBe(TTL + STALE_RETENTION);
  });

  it('期限を過ぎた出題数は、数え直しを待たずに古いまま返す', async () => {
    seedExpired(store, SIZE_KEY, 99);
    const {requestContext} = createRequestContext();

    const size = await new QuizService(
      environment,
      requestContext,
    ).getPoolSize();

    expect(size).toBe(99);
  });

  it('実行コンテキストが無くてもプールを返す', async () => {
    const pool = await new QuizService(environment).getPool();

    expect(pool).toHaveLength(3);
  });
});
