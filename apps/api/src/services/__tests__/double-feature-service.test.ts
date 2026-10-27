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
import {DoubleFeatureService} from '../double-feature-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

type TestDatabase = ReturnType<typeof getDatabase>;

const date = '2026-09-15';

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: TestDatabase;
}> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-double-feature-'),
  );
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database.insert(awardOrganizations).values([
    {uid: 'org-academy', name: 'Academy Awards'},
    {uid: 'org-unknown', name: 'Unknown Awards'},
  ]);
  await database.insert(awardCategories).values([
    {
      uid: 'cat-picture',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Picture',
    },
    {uid: 'cat-unknown', organizationUid: 'org-unknown', name: 'Best Film'},
  ]);
  await database.insert(awardCeremonies).values([
    {uid: 'ceremony-academy', organizationUid: 'org-academy', year: 2000},
    {uid: 'ceremony-unknown', organizationUid: 'org-unknown', year: 2000},
  ]);
  return {environment, database};
}

async function seedMovie(
  database: TestDatabase,
  uid: string,
  options: {
    withoutJaTitle?: boolean;
    withoutPoster?: boolean;
    deletedAt?: number;
  } = {},
): Promise<void> {
  const {withoutJaTitle, withoutPoster, deletedAt} = options;
  await database.insert(movies).values({uid, year: 2000, deletedAt});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: uid,
    languageCode: 'en',
    content: `${uid} title`,
    isDefault: 1,
  });
  if (!withoutJaTitle) {
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: uid,
      languageCode: 'ja',
      content: `${uid}の邦題`,
    });
  }

  if (!withoutPoster) {
    await database.insert(posterUrls).values({
      movieUid: uid,
      url: `https://example.com/${uid}.jpg`,
      isPrimary: 1,
    });
  }
}

async function nominateUnknown(database: TestDatabase, uid: string) {
  await database.insert(nominations).values({
    movieUid: uid,
    ceremonyUid: 'ceremony-unknown',
    categoryUid: 'cat-unknown',
  });
}

async function seedPerson(database: TestDatabase, uid: string, name: string) {
  await database
    .insert(people)
    .values({uid, tmdbId: Number(uid.replaceAll(/\D/g, '')), name});
}

async function direct(
  database: TestDatabase,
  movieUid: string,
  personUid: string,
) {
  await database.insert(movieCredits).values({
    movieUid,
    personUid,
    creditId: `credit-${movieUid}-${personUid}`,
    department: 'Directing',
    job: 'Director',
  });
}

describe('DoubleFeatureService.getDoubleFeature', () => {
  let service: DoubleFeatureService;
  let database: TestDatabase;

  beforeEach(async () => {
    const created = await createTestEnvironment();
    database = created.database;
    service = new DoubleFeatureService(created.environment);
  });

  it('同じ監督の映画を組む', async () => {
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b');
    await nominateUnknown(database, 'movie-a');
    await seedPerson(database, 'person-1', '小津安二郎');
    await direct(database, 'movie-a', 'person-1');
    await direct(database, 'movie-b', 'person-1');

    const feature = await service.getDoubleFeature(date);

    expect(feature?.connection).toEqual({
      kind: 'director',
      label: 'どちらも小津安二郎が監督',
    });
  });

  it('組んだ2本を選ばれた映画、相方の順で返す', async () => {
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b');
    await nominateUnknown(database, 'movie-a');
    await seedPerson(database, 'person-1', '小津安二郎');
    await direct(database, 'movie-a', 'person-1');
    await direct(database, 'movie-b', 'person-1');

    const feature = await service.getDoubleFeature(date);

    expect(feature?.movies).toEqual([
      {
        uid: 'movie-a',
        title: 'movie-aの邦題',
        year: 2000,
        posterUrl: 'https://example.com/movie-a.jpg',
      },
      {
        uid: 'movie-b',
        title: 'movie-bの邦題',
        year: 2000,
        posterUrl: 'https://example.com/movie-b.jpg',
      },
    ]);
  });

  it('同じ俳優が出ている映画を組み、外国人は日本語名で出す', async () => {
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b');
    await nominateUnknown(database, 'movie-a');
    await seedPerson(database, 'person-2', 'Tom Hanks');
    await database.insert(translations).values({
      resourceType: 'person_name',
      resourceUid: 'person-2',
      languageCode: 'ja',
      content: 'トム・ハンクス',
    });
    await database.insert(movieCredits).values(
      ['movie-a', 'movie-b'].map(movieUid => ({
        movieUid,
        personUid: 'person-2',
        creditId: `credit-${movieUid}`,
        department: 'Acting',
        castOrder: 0,
      })),
    );

    const feature = await service.getDoubleFeature(date);

    expect(feature?.connection).toEqual({
      kind: 'cast',
      label: 'トム・ハンクスが両方に出演',
    });
  });

  it('同じ賞のカテゴリの候補どうしを組む', async () => {
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b');
    await database.insert(nominations).values(
      ['movie-a', 'movie-b'].map(movieUid => ({
        movieUid,
        ceremonyUid: 'ceremony-academy',
        categoryUid: 'cat-picture',
      })),
    );

    const feature = await service.getDoubleFeature(date);

    expect(feature?.connection).toEqual({
      kind: 'category',
      label: 'どちらもアカデミー賞 作品賞の候補',
    });
  });

  it('賞のページが無いカテゴリではつながない', async () => {
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b');
    await nominateUnknown(database, 'movie-a');
    await nominateUnknown(database, 'movie-b');

    const feature = await service.getDoubleFeature(date);

    expect(feature).toBeUndefined();
  });

  it('削除された映画は相方にしない', async () => {
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b', {deletedAt: 1_700_000_000});
    await nominateUnknown(database, 'movie-a');
    await seedPerson(database, 'person-1', '小津安二郎');
    await direct(database, 'movie-a', 'person-1');
    await direct(database, 'movie-b', 'person-1');

    const feature = await service.getDoubleFeature(date);

    expect(feature).toBeUndefined();
  });

  it('ポスターの無い映画は相方にしない', async () => {
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b', {withoutPoster: true});
    await nominateUnknown(database, 'movie-a');
    await seedPerson(database, 'person-1', '小津安二郎');
    await direct(database, 'movie-a', 'person-1');
    await direct(database, 'movie-b', 'person-1');

    const feature = await service.getDoubleFeature(date);

    expect(feature).toBeUndefined();
  });

  it('邦題の無い映画は相方にしない', async () => {
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b', {withoutJaTitle: true});
    await nominateUnknown(database, 'movie-a');
    await seedPerson(database, 'person-1', '小津安二郎');
    await direct(database, 'movie-a', 'person-1');
    await direct(database, 'movie-b', 'person-1');

    const feature = await service.getDoubleFeature(date);

    expect(feature).toBeUndefined();
  });

  it('ポスターの無い映画が選ばれたら別の映画から選び直す', async () => {
    await seedMovie(database, 'movie-x', {withoutPoster: true});
    await seedMovie(database, 'movie-y');
    await nominateUnknown(database, 'movie-x');
    await seedPerson(database, 'person-9', '溝口健二');
    await direct(database, 'movie-x', 'person-9');
    await direct(database, 'movie-y', 'person-9');
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b');
    await nominateUnknown(database, 'movie-a');
    await seedPerson(database, 'person-1', '小津安二郎');
    await direct(database, 'movie-a', 'person-1');
    await direct(database, 'movie-b', 'person-1');

    const feature = await service.getDoubleFeature(date);

    expect(feature?.movies.map(movie => movie.uid)).toEqual([
      'movie-a',
      'movie-b',
    ]);
  });

  it('日本で観られる相方を優先する', async () => {
    await seedMovie(database, 'movie-a');
    await nominateUnknown(database, 'movie-a');
    await seedPerson(database, 'person-1', '小津安二郎');
    await direct(database, 'movie-a', 'person-1');
    const partners = ['movie-b', 'movie-c', 'movie-d', 'movie-e'];
    for (const uid of partners) {
      await seedMovie(database, uid);
      await direct(database, uid, 'person-1');
    }

    await database.insert(movieAvailabilityChecks).values([
      {movieUid: 'movie-d', source: 'unext', status: 'ok'},
      ...['movie-b', 'movie-c', 'movie-e'].map(movieUid => ({
        movieUid,
        source: 'unext' as const,
        status: 'ng' as const,
      })),
    ]);

    const feature = await service.getDoubleFeature(date);

    expect(feature?.movies[1].uid).toBe('movie-d');
  });

  it('同じ日付なら同じ組を返す', async () => {
    await seedPerson(database, 'person-1', '小津安二郎');
    for (const uid of ['movie-a', 'movie-b', 'movie-c', 'movie-d']) {
      await seedMovie(database, uid);
      await nominateUnknown(database, uid);
      await direct(database, uid, 'person-1');
    }

    const first = await service.getDoubleFeature(date);
    const second = await service.getDoubleFeature(date);

    expect(second).toEqual(first);
  });

  it('つながる映画が無ければ undefined を返す', async () => {
    await seedMovie(database, 'movie-a');
    await nominateUnknown(database, 'movie-a');

    const feature = await service.getDoubleFeature(date);

    expect(feature).toBeUndefined();
  });
});
