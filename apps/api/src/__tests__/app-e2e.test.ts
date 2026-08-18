 
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createJWT} from '../auth';
import app from '../index';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-secret';
const ADMIN_PASSWORD = 'test-admin-password';

let environment: Environment;

beforeEach(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-e2e-'));
  environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    JWT_SECRET,
    ADMIN_PASSWORD,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database
    .insert(awardOrganizations)
    .values({uid: 'org-1', name: 'Test Award'});
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony-1', organizationUid: 'org-1', year: 2020});
  await database.insert(awardCategories).values({
    uid: 'category-1',
    organizationUid: 'org-1',
    name: 'Best Picture',
  });

  const seedMovies = [
    {uid: 'movie-a', year: 2018, title: 'Alpha Movie', titleJa: 'アルファ'},
    {uid: 'movie-b', year: 2019, title: 'Beta Movie', titleJa: 'ベータ'},
    {uid: 'movie-c', year: 2020, title: 'Gamma Movie', titleJa: 'ガンマ'},
  ];
  for (const seedMovie of seedMovies) {
    await database
      .insert(movies)
      .values({uid: seedMovie.uid, year: seedMovie.year});
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: seedMovie.uid,
      languageCode: 'en',
      content: seedMovie.title,
      isDefault: 1,
    });
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: seedMovie.uid,
      languageCode: 'ja',
      content: seedMovie.titleJa,
    });
    await database.insert(nominations).values({
      movieUid: seedMovie.uid,
      ceremonyUid: 'ceremony-1',
      categoryUid: 'category-1',
    });
  }
});

describe('GET /movies/:id', () => {
  it('returns movie details with the translated title', async () => {
    const response = await app.request(
      '/movies/movie-a?locale=en',
      {},
      environment,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      uid: string;
      year: number;
      title: string;
      nominations: unknown[];
    };
    expect(body).toMatchObject({
      uid: 'movie-a',
      year: 2018,
      title: 'Alpha Movie',
    });
    expect(body.nominations).toHaveLength(1);
  });

  it('returns 404 for a nonexistent movie', async () => {
    const response = await app.request(
      '/movies/no-such-movie',
      {},
      environment,
    );

    expect(response.status).toBe(404);
  });

  it('returns 404 for a soft-deleted movie', async () => {
    const database = getDatabase(environment);
    await database
      .update(movies)
      .set({deletedAt: Math.floor(Date.now() / 1000)})
      .where(eq(movies.uid, 'movie-a'));

    const response = await app.request('/movies/movie-a', {}, environment);

    expect(response.status).toBe(404);
  });
});

async function goldenLionNomination(locale: string) {
  const response = await app.request(
    `/movies/movie-a?locale=${locale}`,
    {},
    environment,
  );
  const body = (await response.json()) as {
    nominations: Array<{
      category: {name: string; displayName?: string};
      organization: {name: string; displayName?: string};
    }>;
  };

  return body.nominations.find(
    nomination => nomination.category.name === 'Golden Lion',
  );
}

describe('GET /movies/:id の賞の表示名', () => {
  beforeEach(async () => {
    const database = getDatabase(environment);
    await database
      .insert(awardOrganizations)
      .values({uid: 'org-venice', name: 'Venice Film Festival'});
    await database.insert(awardCeremonies).values({
      uid: 'ceremony-venice',
      organizationUid: 'org-venice',
      year: 1951,
    });
    await database.insert(awardCategories).values({
      uid: 'category-golden-lion',
      organizationUid: 'org-venice',
      name: 'Golden Lion',
    });
    await database.insert(nominations).values({
      movieUid: 'movie-a',
      ceremonyUid: 'ceremony-venice',
      categoryUid: 'category-golden-lion',
    });
  });

  it('日本語ロケールでは組織名を日本語で返す', async () => {
    const nomination = await goldenLionNomination('ja');

    expect(nomination?.organization.displayName).toBe('ヴェネツィア国際映画祭');
  });

  it('日本語ロケールでは賞の名前を日本語で返す', async () => {
    const nomination = await goldenLionNomination('ja');

    expect(nomination?.category.displayName).toBe('金獅子賞');
  });

  it('英語ロケールでは日本語の表示名を返さない', async () => {
    const nomination = await goldenLionNomination('en');

    expect(nomination?.organization.displayName).toBeUndefined();
    expect(nomination?.category.displayName).toBeUndefined();
  });
});

async function postLogin(password: string) {
  return app.request(
    '/auth/login',
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({password}),
    },
    environment,
  );
}

describe('POST /auth/login', () => {
  it('returns a token for the correct password', async () => {
    const response = await postLogin(ADMIN_PASSWORD);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {token: string};
    expect(body.token).toBeTruthy();
  });

  it('returns 401 for a wrong password', async () => {
    const response = await postLogin('wrong-password');

    expect(response.status).toBe(401);
  });
});

describe('GET /admin/movies', () => {
  it('returns 401 without a token', async () => {
    const response = await app.request('/admin/movies', {}, environment);

    expect(response.status).toBe(401);
  });

  it('returns the movies list with a valid token', async () => {
    const token = await createJWT(JWT_SECRET);
    const response = await app.request(
      '/admin/movies',
      {headers: {Authorization: `Bearer ${token}`}},
      environment,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      movies: Array<{uid: string}>;
      pagination: {totalCount: number};
    };
    expect(body.pagination.totalCount).toBe(3);
  });
});

describe('GET /movies/search', () => {
  it('finds movies whose title matches the query', async () => {
    const response = await app.request(
      `/movies/search?q=${encodeURIComponent('アルファ')}`,
      {},
      environment,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      movies: Array<{uid: string}>;
      pagination: {totalCount: number};
    };
    expect(body.movies.map(movie => movie.uid)).toEqual(['movie-a']);
  });
});

async function postFetchUrlTitle(body: Record<string, unknown>) {
  return app.request(
    '/fetch-url-title',
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    },
    environment,
  );
}

describe('POST /fetch-url-title', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 400 when url is missing', async () => {
    const response = await postFetchUrlTitle({});

    expect(response.status).toBe(400);
  });

  it('returns the page title fetched from the url', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('<html><head><title>Example Page</title></head></html>'),
        ),
    );

    const response = await postFetchUrlTitle({url: 'https://example.com/'});

    expect(response.status).toBe(200);
    const body = (await response.json()) as {title: string};
    expect(body.title).toBe('Example Page');
  });
});

describe('GET /', () => {
  it('returns daily, weekly and monthly selections', async () => {
    const response = await app.request('/', {}, environment);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      daily: {uid: string};
      weekly: {uid: string};
      monthly: {uid: string};
    };
    const seededUids = ['movie-a', 'movie-b', 'movie-c'];
    expect(seededUids).toContain(body.daily.uid);
    expect(seededUids).toContain(body.weekly.uid);
    expect(seededUids).toContain(body.monthly.uid);
  });
});
