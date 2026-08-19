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
import {beforeEach, describe, expect, it} from 'vitest';
import {quizRoutes} from '../routes/quiz';
import {QuizService} from '../services/quiz-service';

function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : 1;
}

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const QUIZ_KEY = 'test-quiz-key';

type SeedPoster = {url: string; languageCode?: string; isPrimary?: number};

type SeedOptions = {
  uid: string;
  title?: string;
  poster?: boolean;
  posters?: SeedPoster[];
  organizations: Array<'cannes' | 'kinema'>;
  deleted?: boolean;
};

async function seedMovie(
  database: ReturnType<typeof getDatabase>,
  {
    uid,
    title,
    poster = true,
    posters,
    organizations,
    deleted = false,
  }: SeedOptions,
) {
  await database.insert(movies).values({
    uid,
    year: 1965,
    originalLanguage: 'ja',
    deletedAt: deleted ? 1 : undefined,
  });

  if (title) {
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: uid,
      languageCode: 'ja',
      content: title,
      isDefault: 1,
    });
  }

  if (posters) {
    await database.insert(posterUrls).values(
      posters.map(entry => ({
        movieUid: uid,
        url: entry.url,
        languageCode: entry.languageCode,
        isPrimary: entry.isPrimary ?? 0,
      })),
    );
  } else if (poster) {
    await database.insert(posterUrls).values({
      movieUid: uid,
      url: `https://image.tmdb.org/t/p/original/${uid}.jpg`,
      isPrimary: 1,
    });
  }

  for (const organization of organizations) {
    await database.insert(nominations).values({
      movieUid: uid,
      ceremonyUid: `ceremony-${organization}`,
      categoryUid: `cat-${organization}`,
      isWinner: 1,
    });
  }
}

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-quiz-'));
  const environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    QUIZ_ANSWER_KEY: QUIZ_KEY,
  } as Environment;
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(awardOrganizations).values([
    {uid: 'org-cannes', name: 'Cannes Film Festival'},
    {uid: 'org-kinema', name: 'Kinema Junpo'},
  ]);
  await database.insert(awardCategories).values([
    {uid: 'cat-cannes', organizationUid: 'org-cannes', name: "Palme d'Or"},
    {
      uid: 'cat-kinema',
      organizationUid: 'org-kinema',
      name: 'Best Japanese Film',
    },
  ]);
  await database.insert(awardCeremonies).values([
    {uid: 'ceremony-cannes', organizationUid: 'org-cannes', year: 1965},
    {uid: 'ceremony-kinema', organizationUid: 'org-kinema', year: 1965},
  ]);

  await seedMovie(database, {
    uid: 'movie-in-pool',
    title: '赤ひげ',
    organizations: ['cannes', 'kinema'],
  });
  await seedMovie(database, {
    uid: 'movie-also-in-pool',
    title: '東京物語',
    organizations: ['cannes', 'kinema'],
  });
  await seedMovie(database, {
    uid: 'movie-single-org',
    title: '無常',
    organizations: ['cannes'],
  });
  await seedMovie(database, {
    uid: 'movie-no-japanese-title',
    organizations: ['cannes', 'kinema'],
  });
  await seedMovie(database, {
    uid: 'movie-no-poster',
    title: 'ポスターなし',
    poster: false,
    organizations: ['cannes', 'kinema'],
  });
  await seedMovie(database, {
    uid: 'movie-deleted',
    title: '削除済み',
    organizations: ['cannes', 'kinema'],
    deleted: true,
  });
  await seedMovie(database, {
    uid: 'movie-with-japanese-poster',
    title: '羅生門',
    organizations: ['cannes', 'kinema'],
    posters: [
      {
        url: 'https://image.tmdb.org/t/p/original/ja.jpg',
        languageCode: 'ja',
        isPrimary: 1,
      },
      {url: 'https://image.tmdb.org/t/p/original/intl.jpg'},
    ],
  });

  return environment;
}

const DATE = '2026-01-15';

async function fetchAnswer(environment: Environment) {
  const response = await quizRoutes.request(
    `/answer?date=${DATE}`,
    {headers: {'X-Quiz-Key': QUIZ_KEY}},
    environment,
  );
  return response.json() as Promise<{
    uid: string;
    title: string;
    posterUrl: string;
    focalX: number;
    focalY: number;
  }>;
}

describe('GET /quiz/daily', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('returns the puzzle date', async () => {
    const response = await quizRoutes.request(
      `/daily?date=${DATE}`,
      {},
      environment,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {date: string};
    expect(body.date).toBe(DATE);
  });

  it('returns the number of attempts', async () => {
    const response = await quizRoutes.request(
      `/daily?date=${DATE}`,
      {},
      environment,
    );

    const body = (await response.json()) as {maxAttempts: number};
    expect(body.maxAttempts).toBe(6);
  });

  it('never exposes the answer', async () => {
    const answer = await fetchAnswer(environment);
    const response = await quizRoutes.request(
      `/daily?date=${DATE}`,
      {},
      environment,
    );

    const raw = await response.text();
    expect(raw).not.toContain(answer.title);
    expect(raw).not.toContain(answer.uid);
    expect(raw).not.toContain('image.tmdb.org');
  });

  it('rejects a future date', async () => {
    const response = await quizRoutes.request(
      '/daily?date=2999-01-01',
      {},
      environment,
    );

    expect(response.status).toBe(400);
  });
});

describe('GET /quiz/answer', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('requires the internal key', async () => {
    const response = await quizRoutes.request(
      `/answer?date=${DATE}`,
      {},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('picks a movie from the pool', async () => {
    const answer = await fetchAnswer(environment);

    expect([
      'movie-in-pool',
      'movie-also-in-pool',
      'movie-with-japanese-poster',
    ]).toContain(answer.uid);
  });

  it('returns the same movie for the same date', async () => {
    const first = await fetchAnswer(environment);
    const second = await fetchAnswer(environment);

    expect(second.uid).toBe(first.uid);
  });

  it('keeps the focal point inside the poster', async () => {
    const answer = await fetchAnswer(environment);

    expect(answer.focalX).toBeGreaterThanOrEqual(0);
    expect(answer.focalX).toBeLessThanOrEqual(1);
  });
});

describe('出題ポスター', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('邦題が刷られたポスターを避ける', async () => {
    const pool = await new QuizService(environment).getPool();
    const entry = pool.find(item => item.uid === 'movie-with-japanese-poster');

    expect(entry?.posterUrl).toBe(
      'https://image.tmdb.org/t/p/original/intl.jpg',
    );
  });
});

describe('GET /quiz/candidates', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  async function fetchCandidates() {
    const response = await quizRoutes.request('/candidates', {}, environment);
    const body = (await response.json()) as {
      candidates: Array<{uid: string; title: string}>;
    };
    return body.candidates;
  }

  it('lists every movie in the pool', async () => {
    const candidates = await fetchCandidates();

    expect(
      candidates.map(candidate => candidate.uid).toSorted(byCodePoint),
    ).toEqual([
      'movie-also-in-pool',
      'movie-in-pool',
      'movie-with-japanese-poster',
    ]);
  });

  it('carries the title of each candidate', async () => {
    const candidates = await fetchCandidates();

    expect(
      candidates.map(candidate => candidate.title).toSorted(byCodePoint),
    ).toEqual(['東京物語', '羅生門', '赤ひげ']);
  });
});

describe('POST /quiz/guess', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  async function guess(body: Record<string, unknown>) {
    const response = await quizRoutes.request(
      '/guess',
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({date: DATE, ...body}),
      },
      environment,
    );
    return response.json() as Promise<{
      correct: boolean;
      hint?: {label: string; value: string};
      answer?: {uid: string; title: string};
    }>;
  }

  it('accepts the right movie', async () => {
    const answer = await fetchAnswer(environment);
    const result = await guess({movieUid: answer.uid, attempt: 1});

    expect(result.correct).toBe(true);
  });

  it('reveals the answer once solved', async () => {
    const answer = await fetchAnswer(environment);
    const result = await guess({movieUid: answer.uid, attempt: 1});

    expect(result.answer?.title).toBe(answer.title);
  });

  it('rejects a wrong movie', async () => {
    const answer = await fetchAnswer(environment);
    const wrong =
      answer.uid === 'movie-in-pool' ? 'movie-also-in-pool' : 'movie-in-pool';
    const result = await guess({movieUid: wrong, attempt: 1});

    expect(result.correct).toBe(false);
  });

  it('hides the answer while attempts remain', async () => {
    const answer = await fetchAnswer(environment);
    const wrong =
      answer.uid === 'movie-in-pool' ? 'movie-also-in-pool' : 'movie-in-pool';
    const result = await guess({movieUid: wrong, attempt: 1});

    expect(result.answer).toBeUndefined();
  });

  it('opens one hint per wrong guess', async () => {
    const result = await guess({movieUid: undefined, attempt: 1});

    expect(result.hint?.label).toBe('製作年');
  });

  it('opens a later hint on a later attempt', async () => {
    const result = await guess({movieUid: undefined, attempt: 3});

    expect(result.hint?.label).toBe('選出した映画賞');
  });

  it('reveals the answer after the last attempt', async () => {
    const answer = await fetchAnswer(environment);
    const result = await guess({movieUid: undefined, attempt: 6});

    expect(result.answer?.title).toBe(answer.title);
  });
});
