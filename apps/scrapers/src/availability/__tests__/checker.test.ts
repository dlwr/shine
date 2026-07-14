import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import {movies} from '@shine/database/schema/movies';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {checkMovieAvailability} from '../checker';
import type {SourceCheckResult} from '../types';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

const DAY_SECONDS = 24 * 60 * 60;
const now = new Date('2026-07-15T00:10:00Z');
const nowEpoch = Math.floor(now.getTime() / 1000);

const movie = {
  uid: 'movie-a',
  titles: ['ゴッドファーザー', 'The Godfather'],
};

function okResult(source: SourceCheckResult['source']): SourceCheckResult {
  return {source, status: 'ok', detail: 'Matched'};
}

function ngResult(source: SourceCheckResult['source']): SourceCheckResult {
  return {source, status: 'ng', detail: 'No match'};
}

describe('checkMovieAvailability', () => {
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    const environment: Environment = {
      TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: '',
    };
    database = getDatabase(environment);
    await migrate(database, {migrationsFolder});
    await database.insert(movies).values({uid: 'movie-a', year: 1972});
  });

  it('returns available=true when any source returns ok and persists results', async () => {
    const runners = {
      tmdb: vi.fn(async () => okResult('tmdb')),
      unext: vi.fn(async () => ngResult('unext')),
    };

    const decision = await checkMovieAvailability(database, movie, {
      sourceRunners: runners,
      now,
    });

    expect(decision.available).toBe(true);
    const rows = await database.select().from(movieAvailabilityChecks);
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.movieUid === 'movie-a')).toBe(true);
  });

  it('returns available=false when all sources return ng', async () => {
    const runners = {
      tmdb: vi.fn(async () => ngResult('tmdb')),
      geo: vi.fn(async () => ngResult('geo')),
    };

    const decision = await checkMovieAvailability(database, movie, {
      sourceRunners: runners,
      now,
    });

    expect(decision.available).toBe(false);
  });

  it('uses a fresh ok record without calling any runner', async () => {
    await database.insert(movieAvailabilityChecks).values({
      movieUid: 'movie-a',
      source: 'tmdb',
      status: 'ok',
      checkedAt: nowEpoch - 3 * DAY_SECONDS,
    });
    const runners = {tmdb: vi.fn(async () => ngResult('tmdb'))};

    const decision = await checkMovieAvailability(database, movie, {
      sourceRunners: runners,
      now,
    });

    expect(decision.available).toBe(true);
    expect(runners.tmdb).not.toHaveBeenCalled();
  });

  it('re-checks when the ok record is older than 7 days', async () => {
    await database.insert(movieAvailabilityChecks).values({
      movieUid: 'movie-a',
      source: 'tmdb',
      status: 'ok',
      checkedAt: nowEpoch - 8 * DAY_SECONDS,
    });
    const runners = {tmdb: vi.fn(async () => ngResult('tmdb'))};

    const decision = await checkMovieAvailability(database, movie, {
      sourceRunners: runners,
      now,
    });

    expect(runners.tmdb).toHaveBeenCalled();
    expect(decision.available).toBe(false);
  });

  it('skips a source with a fresh ng record', async () => {
    await database.insert(movieAvailabilityChecks).values({
      movieUid: 'movie-a',
      source: 'geo',
      status: 'ng',
      checkedAt: nowEpoch - 30 * DAY_SECONDS,
    });
    const runners = {
      tmdb: vi.fn(async () => ngResult('tmdb')),
      geo: vi.fn(async () => ngResult('geo')),
    };

    const decision = await checkMovieAvailability(database, movie, {
      sourceRunners: runners,
      now,
    });

    expect(runners.geo).not.toHaveBeenCalled();
    expect(runners.tmdb).toHaveBeenCalled();
    expect(decision.available).toBe(false);
  });

  it('re-checks a source whose ng record is older than 90 days', async () => {
    await database.insert(movieAvailabilityChecks).values({
      movieUid: 'movie-a',
      source: 'geo',
      status: 'ng',
      checkedAt: nowEpoch - 91 * DAY_SECONDS,
    });
    const runners = {geo: vi.fn(async () => okResult('geo'))};

    const decision = await checkMovieAvailability(database, movie, {
      sourceRunners: runners,
      now,
    });

    expect(runners.geo).toHaveBeenCalled();
    expect(decision.available).toBe(true);
  });

  it('does not treat an error record as cache', async () => {
    await database.insert(movieAvailabilityChecks).values({
      movieUid: 'movie-a',
      source: 'unext',
      status: 'error',
      checkedAt: nowEpoch - 1 * DAY_SECONDS,
    });
    const runners = {unext: vi.fn(async () => okResult('unext'))};

    const decision = await checkMovieAvailability(database, movie, {
      sourceRunners: runners,
      now,
    });

    expect(runners.unext).toHaveBeenCalled();
    expect(decision.available).toBe(true);
  });

  it('treats error results as unavailable but reports them', async () => {
    const runners = {
      unext: vi.fn(
        async (): Promise<SourceCheckResult> => ({
          source: 'unext',
          status: 'error',
          detail: 'boom',
        }),
      ),
    };

    const decision = await checkMovieAvailability(database, movie, {
      sourceRunners: runners,
      now,
    });

    expect(decision.available).toBe(false);
    expect(decision.results.some(r => r.status === 'error')).toBe(true);
  });
});
