import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {moviesRoutes} from '../routes/movies';
import {invalidateMovieCaches} from '../services/movie-cache-invalidation';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type RelatedMovie = {
  uid: string;
  title: string;
  year: number | undefined;
  posterUrl: string | undefined;
};

type RelatedResponse = {movies: RelatedMovie[]};

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(awardOrganizations).values([
    {uid: 'org-cannes', name: 'Cannes Film Festival'},
    {uid: 'org-other', name: 'Other Awards'},
  ]);
  await database.insert(awardCategories).values([
    {uid: 'cat-palme', organizationUid: 'org-cannes', name: "Palme d'Or"},
    {uid: 'cat-other', organizationUid: 'org-other', name: 'Other Prize'},
  ]);
  await database.insert(awardCeremonies).values([
    {uid: 'cer-2023', organizationUid: 'org-cannes', year: 2023},
    {uid: 'cer-2022', organizationUid: 'org-cannes', year: 2022},
    {uid: 'cer-2021', organizationUid: 'org-cannes', year: 2021},
    {uid: 'cer-other', organizationUid: 'org-other', year: 2023},
  ]);

  await database.insert(movies).values([
    {uid: 'movie-target', year: 2023},
    {uid: 'movie-winner', year: 2022},
    {uid: 'movie-nominee', year: 2021},
    {uid: 'movie-unrelated', year: 2023},
    {uid: 'movie-deleted', year: 2022, deletedAt: 1},
  ]);

  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-target',
      languageCode: 'en',
      content: 'Target Movie',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-winner',
      languageCode: 'ja',
      content: '受賞作',
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-winner',
      languageCode: 'en',
      content: 'Winner Movie',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-nominee',
      languageCode: 'en',
      content: 'Nominee Movie',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-unrelated',
      languageCode: 'en',
      content: 'Unrelated Movie',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-deleted',
      languageCode: 'en',
      content: 'Deleted Movie',
      isDefault: 1,
    },
  ]);

  await database.insert(posterUrls).values({
    movieUid: 'movie-winner',
    url: 'https://example.com/winner.jpg',
    isPrimary: 1,
  });

  await database.insert(nominations).values([
    {
      uid: 'nom-target',
      movieUid: 'movie-target',
      ceremonyUid: 'cer-2023',
      categoryUid: 'cat-palme',
      isWinner: 0,
    },
    {
      uid: 'nom-winner',
      movieUid: 'movie-winner',
      ceremonyUid: 'cer-2022',
      categoryUid: 'cat-palme',
      isWinner: 1,
    },
    {
      uid: 'nom-nominee',
      movieUid: 'movie-nominee',
      ceremonyUid: 'cer-2021',
      categoryUid: 'cat-palme',
      isWinner: 0,
    },
    {
      uid: 'nom-unrelated',
      movieUid: 'movie-unrelated',
      ceremonyUid: 'cer-other',
      categoryUid: 'cat-other',
      isWinner: 1,
    },
    {
      uid: 'nom-deleted',
      movieUid: 'movie-deleted',
      ceremonyUid: 'cer-2022',
      categoryUid: 'cat-palme',
      isWinner: 1,
    },
  ]);

  return environment;
}

describe('GET /movies/:id/related', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('同じ賞カテゴリの映画を返す（自分自身は除く）', async () => {
    const response = await moviesRoutes.request(
      '/movie-target/related',
      {},
      environment,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as RelatedResponse;
    const uids = body.movies.map(movie => movie.uid);
    expect(uids).toContain('movie-winner');
    expect(uids).toContain('movie-nominee');
    expect(uids).not.toContain('movie-target');
  });

  it('別カテゴリだけの映画は含めない', async () => {
    const response = await moviesRoutes.request(
      '/movie-target/related',
      {},
      environment,
    );

    const body = (await response.json()) as RelatedResponse;
    expect(body.movies.map(movie => movie.uid)).not.toContain(
      'movie-unrelated',
    );
  });

  it('削除済みの映画は含めない', async () => {
    const response = await moviesRoutes.request(
      '/movie-target/related',
      {},
      environment,
    );

    const body = (await response.json()) as RelatedResponse;
    expect(body.movies.map(movie => movie.uid)).not.toContain('movie-deleted');
  });

  it('受賞作を先頭にする', async () => {
    const response = await moviesRoutes.request(
      '/movie-target/related',
      {},
      environment,
    );

    const body = (await response.json()) as RelatedResponse;
    expect(body.movies[0].uid).toBe('movie-winner');
  });

  it('localeのタイトルとポスターを返す', async () => {
    const response = await moviesRoutes.request(
      '/movie-target/related?locale=ja',
      {},
      environment,
    );

    const body = (await response.json()) as RelatedResponse;
    const winner = body.movies.find(movie => movie.uid === 'movie-winner');
    expect(winner?.title).toBe('受賞作');
    expect(winner?.posterUrl).toBe('https://example.com/winner.jpg');
  });

  it('limitで件数を絞れる', async () => {
    const response = await moviesRoutes.request(
      '/movie-target/related?limit=1',
      {},
      environment,
    );

    const body = (await response.json()) as RelatedResponse;
    expect(body.movies).toHaveLength(1);
  });

  it('存在しない映画は404を返す', async () => {
    const response = await moviesRoutes.request(
      '/no-such-movie/related',
      {},
      environment,
    );

    expect(response.status).toBe(404);
  });
});

function createMemoryKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      const raw = store.get(key);
      // eslint-disable-next-line unicorn/no-null -- KVNamespace.get returns null for missing keys
      return raw === undefined ? null : JSON.parse(raw);
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

describe('GET /movies/:id/related のキャッシュ', () => {
  it('limit を含めない鍵を colo に 10 分置いて読む', async () => {
    const environment = await createTestEnvironment();
    const get = vi.fn().mockResolvedValue(undefined);
    environment.CACHE_KV = {
      get,
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as KVNamespace;

    await moviesRoutes.request(
      '/movie-target/related?limit=1',
      {},
      environment,
    );

    expect(get).toHaveBeenCalledWith(
      'movie:movie-target:related:ja:v3',
      expect.objectContaining({type: 'json', cacheTtl: 600}),
    );
  });

  it('limit が違っても同じ鍵から件数を切り出す', async () => {
    const environment = await createTestEnvironment();
    environment.CACHE_KV = createMemoryKv();
    await moviesRoutes.request(
      '/movie-target/related?limit=1',
      {},
      environment,
    );

    const response = await moviesRoutes.request(
      '/movie-target/related?limit=2',
      {},
      environment,
    );

    const body = (await response.json()) as RelatedResponse;
    expect(response.headers.get('X-Cache-Status')).toBe('HIT');
    expect(body.movies.map(movie => movie.uid)).toEqual([
      'movie-winner',
      'movie-nominee',
    ]);
  });

  it('映画のキャッシュを無効化すると関連映画も引き直す', async () => {
    const environment = await createTestEnvironment();
    environment.CACHE_KV = createMemoryKv();
    await moviesRoutes.request('/movie-target/related', {}, environment);

    await invalidateMovieCaches(environment, 'movie-target');

    const response = await moviesRoutes.request(
      '/movie-target/related',
      {},
      environment,
    );
    expect(response.headers.get('X-Cache-Status')).toBe('MISS');
  });
});
