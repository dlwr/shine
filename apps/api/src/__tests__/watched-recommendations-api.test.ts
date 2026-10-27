import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {people} from '@shine/database/schema/people';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {watchedRoutes} from '../routes/watched';
import type {WatchedRecommendationsResponse} from '../types/watched-recommendations';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const watchedUid = '00000000-0000-4000-8000-000000000001';
const unwatchedUid = '00000000-0000-4000-8000-000000000002';

function uidAt(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

describe('GET /watched/recommendations', () => {
  let environment: Environment;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'shine-watched-recommendations-api-'),
    );
    environment = {
      DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
    };
    const database = getDatabase(environment);
    await migrate(database, {migrationsFolder});
    await database
      .insert(people)
      .values({uid: 'person-1', tmdbId: 1, name: '監督'});
    for (const uid of [watchedUid, unwatchedUid]) {
      await database.insert(movies).values({uid, year: 2000});
      await database.insert(translations).values({
        resourceType: 'movie_title',
        resourceUid: uid,
        languageCode: 'ja',
        content: `${uid}の邦題`,
        isDefault: 1,
      });
      await database.insert(posterUrls).values({
        movieUid: uid,
        url: `https://example.com/${uid}.jpg`,
        isPrimary: 1,
      });
      await database.insert(movieCredits).values({
        movieUid: uid,
        personUid: 'person-1',
        creditId: `credit-${uid}`,
        department: 'Directing',
        job: 'Director',
      });
    }
  });

  it('観た映画からつながる映画を返す', async () => {
    const response = await watchedRoutes.request(
      `/recommendations?uids=${watchedUid}`,
      {},
      environment,
    );
    const body: WatchedRecommendationsResponse = await response.json();

    expect(body.movies.map(movie => movie.uid)).toEqual([unwatchedUid]);
  });

  it('uid の形式でない値があれば 400 を返す', async () => {
    const response = await watchedRoutes.request(
      `/recommendations?uids=${watchedUid},movie-a`,
      {},
      environment,
    );

    expect(response.status).toBe(400);
  });

  it('uid が無ければ 400 を返す', async () => {
    const response = await watchedRoutes.request(
      '/recommendations',
      {},
      environment,
    );

    expect(response.status).toBe(400);
  });

  it('20 本を超える uid は 400 を返す', async () => {
    const uids = Array.from({length: 21}, (_, index) => uidAt(index + 100));
    const response = await watchedRoutes.request(
      `/recommendations?uids=${uids.join(',')}`,
      {},
      environment,
    );

    expect(response.status).toBe(400);
  });

  it('20 本までの uid は受け付ける', async () => {
    const uids = Array.from({length: 19}, (_, index) => uidAt(index + 100));
    const response = await watchedRoutes.request(
      `/recommendations?uids=${[watchedUid, ...uids].join(',')}`,
      {},
      environment,
    );

    expect(response.status).toBe(200);
  });
});
