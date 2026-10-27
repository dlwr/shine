import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {WatchedRecommendationsService} from '../watched-recommendations-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

type TestDatabase = ReturnType<typeof getDatabase>;

async function seedMovie(
  database: TestDatabase,
  uid: string,
  options: {
    withoutJaTitle?: boolean;
    withoutPoster?: boolean;
    deletedAt?: number;
  } = {},
): Promise<void> {
  await database
    .insert(movies)
    .values({uid, year: 2000, deletedAt: options.deletedAt});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: uid,
    languageCode: 'en',
    content: `${uid} title`,
    isDefault: 1,
  });
  if (!options.withoutJaTitle) {
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: uid,
      languageCode: 'ja',
      content: `${uid}の邦題`,
    });
  }

  if (!options.withoutPoster) {
    await database.insert(posterUrls).values({
      movieUid: uid,
      url: `https://example.com/${uid}.jpg`,
      isPrimary: 1,
    });
  }
}

async function seedPerson(database: TestDatabase, uid: string, name: string) {
  await database
    .insert(people)
    .values({uid, tmdbId: Number(uid.replaceAll(/\D/g, '')), name});
}

async function direct(
  database: TestDatabase,
  personUid: string,
  movieUids: string[],
) {
  await database.insert(movieCredits).values(
    movieUids.map(movieUid => ({
      movieUid,
      personUid,
      creditId: `director-${movieUid}-${personUid}`,
      department: 'Directing',
      job: 'Director',
    })),
  );
}

async function act(
  database: TestDatabase,
  personUid: string,
  movieUids: string[],
) {
  await database.insert(movieCredits).values(
    movieUids.map(movieUid => ({
      movieUid,
      personUid,
      creditId: `cast-${movieUid}-${personUid}`,
      department: 'Acting',
      castOrder: 0,
    })),
  );
}

async function markAvailability(
  database: TestDatabase,
  movieUid: string,
  status: 'ok' | 'ng',
) {
  await database
    .insert(movieAvailabilityChecks)
    .values({movieUid, source: 'unext', status});
}

async function nominateForBestPicture(
  database: TestDatabase,
  movieUids: string[],
) {
  await database
    .insert(awardOrganizations)
    .values({uid: 'org-academy', name: 'Academy Awards'});
  await database.insert(awardCategories).values({
    uid: 'cat-picture',
    organizationUid: 'org-academy',
    name: 'Academy Award for Best Picture',
  });
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony', organizationUid: 'org-academy', year: 2000});
  await database.insert(nominations).values(
    movieUids.map(movieUid => ({
      movieUid,
      ceremonyUid: 'ceremony',
      categoryUid: 'cat-picture',
    })),
  );
}

describe('WatchedRecommendationsService.recommend', () => {
  let database: TestDatabase;
  let service: WatchedRecommendationsService;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'shine-watched-recommendations-'),
    );
    const environment: Environment = {
      DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
    };
    database = getDatabase(environment);
    await migrate(database, {migrationsFolder});
    await seedPerson(database, 'person-1', '小津安二郎');
    await seedPerson(database, 'person-2', '原節子');
    service = new WatchedRecommendationsService(environment);
  });

  it('観た映画と同じ監督の映画に理由を付けて薦める', async () => {
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b');
    await direct(database, 'person-1', ['movie-a', 'movie-b']);

    const recommendations = await service.recommend(['movie-a']);

    expect(recommendations).toEqual([
      {
        uid: 'movie-b',
        title: 'movie-bの邦題',
        year: 2000,
        posterUrl: 'https://example.com/movie-b.jpg',
        reason: '『movie-aの邦題』と同じ監督（小津安二郎）',
      },
    ]);
  });

  it('同じ俳優の映画には俳優の理由を付ける', async () => {
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b');
    await act(database, 'person-2', ['movie-a', 'movie-b']);

    const [recommendation] = await service.recommend(['movie-a']);

    expect(recommendation.reason).toBe(
      '『movie-aの邦題』と同じ出演者（原節子）',
    );
  });

  it('同じ賞のカテゴリの映画には賞の理由を付ける', async () => {
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b');
    await nominateForBestPicture(database, ['movie-a', 'movie-b']);

    const [recommendation] = await service.recommend(['movie-a']);

    expect(recommendation.reason).toMatch(/^『movie-aの邦題』と同じ.+の候補$/);
  });

  it('監督のつながりを俳優のつながりより理由に選ぶ', async () => {
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b');
    await direct(database, 'person-1', ['movie-a', 'movie-b']);
    await act(database, 'person-2', ['movie-a', 'movie-b']);

    const [recommendation] = await service.recommend(['movie-a']);

    expect(recommendation.reason).toBe(
      '『movie-aの邦題』と同じ監督（小津安二郎）',
    );
  });

  it('観た映画どうしは薦めない', async () => {
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b');
    await seedMovie(database, 'movie-c');
    await direct(database, 'person-1', ['movie-a', 'movie-b', 'movie-c']);

    const recommendations = await service.recommend(['movie-a', 'movie-b']);

    expect(recommendations.map(movie => movie.uid)).toEqual(['movie-c']);
  });

  it('ソフト削除・邦題なし・ポスターなしの映画は薦めない', async () => {
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-deleted', {deletedAt: 1});
    await seedMovie(database, 'movie-no-title', {withoutJaTitle: true});
    await seedMovie(database, 'movie-no-poster', {withoutPoster: true});
    await seedMovie(database, 'movie-ok');
    await direct(database, 'person-1', [
      'movie-a',
      'movie-deleted',
      'movie-no-title',
      'movie-no-poster',
      'movie-ok',
    ]);

    const recommendations = await service.recommend(['movie-a']);

    expect(recommendations.map(movie => movie.uid)).toEqual(['movie-ok']);
  });

  it('日本で観られる映画を先に並べる', async () => {
    for (const uid of ['movie-a', 'movie-b', 'movie-c', 'movie-d']) {
      await seedMovie(database, uid);
    }

    await direct(database, 'person-1', [
      'movie-a',
      'movie-b',
      'movie-c',
      'movie-d',
    ]);
    await markAvailability(database, 'movie-b', 'ng');
    await markAvailability(database, 'movie-d', 'ok');

    const recommendations = await service.recommend(['movie-a']);

    expect(recommendations.map(movie => movie.uid)).toEqual([
      'movie-d',
      'movie-b',
      'movie-c',
    ]);
  });

  it('観た映画の多くとつながる映画を先に並べる', async () => {
    for (const uid of ['movie-a', 'movie-b', 'movie-c', 'movie-d', 'movie-e']) {
      await seedMovie(database, uid);
    }

    await direct(database, 'person-1', ['movie-a', 'movie-c', 'movie-d']);
    await act(database, 'person-2', ['movie-b', 'movie-e', 'movie-d']);

    const [first] = await service.recommend(['movie-a', 'movie-b']);

    expect(first.uid).toBe('movie-d');
  });

  it('監督・出演者・賞の順につながりの強い映画を先に並べる', async () => {
    for (const uid of ['movie-a', 'movie-b', 'movie-c', 'movie-d', 'movie-e']) {
      await seedMovie(database, uid);
    }

    await nominateForBestPicture(database, ['movie-a', 'movie-b', 'movie-c']);
    await act(database, 'person-2', ['movie-a', 'movie-c', 'movie-d']);
    await direct(database, 'person-1', ['movie-a', 'movie-e']);

    const recommendations = await service.recommend(['movie-a']);

    expect(recommendations.map(movie => movie.uid)).toEqual([
      'movie-e',
      'movie-c',
      'movie-d',
      'movie-b',
    ]);
  });

  it('同じ観た映画からの推薦が続かないように散らす', async () => {
    for (const uid of ['movie-a', 'movie-b', 'movie-c', 'movie-d', 'movie-e']) {
      await seedMovie(database, uid);
    }

    await seedPerson(database, 'person-3', '成瀬巳喜男');
    await direct(database, 'person-1', ['movie-a', 'movie-c', 'movie-d']);
    await direct(database, 'person-3', ['movie-b', 'movie-e']);

    const recommendations = await service.recommend(['movie-a', 'movie-b']);

    expect(recommendations.map(movie => movie.uid)).toEqual([
      'movie-c',
      'movie-e',
      'movie-d',
    ]);
  });

  it('薦める本数に上限がある', async () => {
    const uids = Array.from({length: 15}, (_, index) => `movie-${index + 10}`);
    for (const uid of ['movie-a', ...uids]) {
      await seedMovie(database, uid);
    }

    await direct(database, 'person-1', ['movie-a', ...uids]);

    const recommendations = await service.recommend(['movie-a']);

    expect(recommendations).toHaveLength(10);
  });

  it('観た映画が無ければ何も薦めない', async () => {
    expect(await service.recommend([])).toEqual([]);
  });
});
