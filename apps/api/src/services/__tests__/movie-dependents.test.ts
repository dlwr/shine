import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {is} from 'drizzle-orm';
import {eq, getDatabase, runBatch, type Environment} from '@shine/database';
import * as schema from '@shine/database/schema/index';
import {articleLinks} from '@shine/database/schema/article-links';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {quizSelections} from '@shine/database/schema/quiz-selections';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import {watchedMarks} from '@shine/database/schema/watched-marks';
import {getTableConfig, SQLiteTable} from 'drizzle-orm/sqlite-core';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {
  deleteMovieDependents,
  movieDependentTables,
  reassignMovieDependents,
} from '../movie-dependents';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

type Database = ReturnType<typeof getDatabase>;

async function createDatabase(): Promise<Database> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return database;
}

async function seedAwardTree(database: Database): Promise<void> {
  await database
    .insert(awardOrganizations)
    .values({uid: 'org', name: 'Org', shortName: 'ORG'});
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony', organizationUid: 'org', year: 2020});
  await database
    .insert(awardCategories)
    .values({uid: 'category', organizationUid: 'org', name: 'Best Film'});
}

async function seedAllDependents(
  database: Database,
  movieUid: string,
): Promise<void> {
  await database
    .insert(articleLinks)
    .values({movieUid, url: `https://example.com/${movieUid}`});
  await database.insert(movieCredits).values({
    movieUid,
    personUid: 'person',
    creditId: `credit-${movieUid}`,
    department: 'Directing',
    job: 'Director',
  });
  await database
    .insert(movieAvailabilityChecks)
    .values({movieUid, source: 'tmdb', status: 'ok'});
  await database.insert(movieSelections).values({
    movieId: movieUid,
    selectionType: 'daily',
    selectionDate: `2026-09-${movieUid === 'source' ? '01' : '02'}`,
  });
  await database.insert(quizSelections).values({
    movieUid,
    quizDate: `2026-09-${movieUid === 'source' ? '01' : '02'}`,
  });
  await database.insert(nominations).values({
    movieUid,
    ceremonyUid: 'ceremony',
    categoryUid: 'category',
  });
  await database.insert(referenceUrls).values({
    movieUid,
    url: `https://en.wikipedia.org/wiki/${movieUid}`,
    sourceType: 'wikipedia',
    languageCode: 'en',
  });
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: movieUid,
    languageCode: 'en',
    content: `Title of ${movieUid}`,
  });
  await database.insert(posterUrls).values({
    movieUid,
    url: `https://img.example.com/${movieUid}.jpg`,
    width: 500,
    height: 750,
  });
  await database
    .insert(watchedMarks)
    .values({movieUid, submitterIp: '203.0.113.1'});
}

describe('movieDependentTables', () => {
  it('lists every table whose foreign key references movies', () => {
    const referencingTables = Object.values(schema as Record<string, unknown>)
      .filter((value): value is SQLiteTable => is(value, SQLiteTable))
      .filter(table =>
        getTableConfig(table).foreignKeys.some(
          foreignKey => foreignKey.reference().foreignTable === movies,
        ),
      )
      .map(table => getTableConfig(table).name);

    const handledTables = movieDependentTables.map(
      table => getTableConfig(table).name,
    );

    expect(handledTables).toEqual(expect.arrayContaining(referencingTables));
  });

  it('includes translations, which reference movies without a foreign key', () => {
    expect(movieDependentTables).toContain(translations);
  });
});

describe('deleteMovieDependents', () => {
  let database: Database;

  beforeEach(async () => {
    database = await createDatabase();
    await database.insert(movies).values({uid: 'source', year: 2020});
    await database
      .insert(people)
      .values({uid: 'person', tmdbId: 5026, name: '黒澤明'});
    await seedAwardTree(database);
    await seedAllDependents(database, 'source');
    await runBatch(database, deleteMovieDependents(database, 'source'));
  });

  it('deletes article links', async () => {
    expect(await database.select().from(articleLinks)).toHaveLength(0);
  });

  it('deletes credits', async () => {
    expect(await database.select().from(movieCredits)).toHaveLength(0);
  });

  it('deletes availability checks', async () => {
    expect(await database.select().from(movieAvailabilityChecks)).toHaveLength(
      0,
    );
  });

  it('deletes movie selections', async () => {
    expect(await database.select().from(movieSelections)).toHaveLength(0);
  });

  it('deletes quiz selections', async () => {
    expect(await database.select().from(quizSelections)).toHaveLength(0);
  });

  it('deletes nominations', async () => {
    expect(await database.select().from(nominations)).toHaveLength(0);
  });

  it('deletes reference urls', async () => {
    expect(await database.select().from(referenceUrls)).toHaveLength(0);
  });

  it('deletes translations', async () => {
    expect(await database.select().from(translations)).toHaveLength(0);
  });

  it('deletes watched marks', async () => {
    expect(await database.select().from(watchedMarks)).toHaveLength(0);
  });

  it('deletes posters', async () => {
    expect(await database.select().from(posterUrls)).toHaveLength(0);
  });

  it('leaves the movie row itself', async () => {
    expect(await database.select().from(movies)).toHaveLength(1);
  });
});

describe('reassignMovieDependents', () => {
  let database: Database;

  beforeEach(async () => {
    database = await createDatabase();
    await database.insert(movies).values([
      {uid: 'source', year: 2020},
      {uid: 'target', year: 2020},
    ]);
    await database
      .insert(people)
      .values({uid: 'person', tmdbId: 5026, name: '黒澤明'});
    await seedAwardTree(database);
  });

  async function reassign(
    options: {preserveTranslations?: boolean; preservePosters?: boolean} = {},
  ): Promise<void> {
    await runBatch(
      database,
      await reassignMovieDependents(database, 'source', 'target', options),
    );
  }

  describe('when the target has no rows of its own', () => {
    beforeEach(async () => {
      await seedAllDependents(database, 'source');
      await reassign();
    });

    it('moves article links to the target', async () => {
      const rows = await database.select().from(articleLinks);
      expect(rows.map(row => row.movieUid)).toEqual(['target']);
    });

    it('moves credits to the target', async () => {
      const rows = await database.select().from(movieCredits);
      expect(rows.map(row => row.movieUid)).toEqual(['target']);
    });

    it('deletes the availability checks of the source', async () => {
      expect(
        await database.select().from(movieAvailabilityChecks),
      ).toHaveLength(0);
    });

    it('deletes the watched marks of the source', async () => {
      expect(await database.select().from(watchedMarks)).toHaveLength(0);
    });

    it('moves movie selections to the target', async () => {
      const rows = await database.select().from(movieSelections);
      expect(rows.map(row => row.movieId)).toEqual(['target']);
    });

    it('moves quiz selections to the target', async () => {
      const rows = await database.select().from(quizSelections);
      expect(rows.map(row => row.movieUid)).toEqual(['target']);
    });

    it('moves nominations to the target', async () => {
      const rows = await database.select().from(nominations);
      expect(rows.map(row => row.movieUid)).toEqual(['target']);
    });

    it('moves reference urls to the target', async () => {
      const rows = await database.select().from(referenceUrls);
      expect(rows.map(row => row.movieUid)).toEqual(['target']);
    });

    it('moves translations to the target', async () => {
      const rows = await database.select().from(translations);
      expect(rows.map(row => [row.resourceUid, row.content])).toEqual([
        ['target', 'Title of source'],
      ]);
    });

    it('moves posters to the target', async () => {
      const rows = await database.select().from(posterUrls);
      expect(rows.map(row => [row.movieUid, row.url])).toEqual([
        ['target', 'https://img.example.com/source.jpg'],
      ]);
    });

    it('leaves both movie rows', async () => {
      expect(await database.select().from(movies)).toHaveLength(2);
    });
  });

  describe('when the target already has rows of its own', () => {
    beforeEach(async () => {
      await database.insert(movieCredits).values({
        movieUid: 'target',
        personUid: 'person',
        creditId: 'credit-target',
        department: 'Directing',
        job: 'Director',
      });
      await database.insert(translations).values({
        resourceType: 'movie_title',
        resourceUid: 'target',
        languageCode: 'en',
        content: 'Title of target',
      });
      await database.insert(posterUrls).values({
        movieUid: 'target',
        url: 'https://img.example.com/target.jpg',
      });
      await seedAllDependents(database, 'source');
      await reassign();
    });

    it('drops the source credits', async () => {
      const rows = await database.select().from(movieCredits);
      expect(rows.map(row => row.creditId)).toEqual(['credit-target']);
    });

    it('keeps the target translation for a language both movies have', async () => {
      const rows = await database.select().from(translations);
      expect(rows.map(row => [row.resourceUid, row.content])).toEqual([
        ['target', 'Title of target'],
      ]);
    });

    it('adds source translations for languages the target lacks', async () => {
      await database.insert(movies).values({uid: 'source-2', year: 2020});
      await database.insert(translations).values({
        resourceType: 'movie_title',
        resourceUid: 'source-2',
        languageCode: 'ja',
        content: '邦題',
      });
      await runBatch(
        database,
        await reassignMovieDependents(database, 'source-2', 'target', {}),
      );

      const rows = await database
        .select({languageCode: translations.languageCode})
        .from(translations)
        .where(eq(translations.resourceUid, 'target'))
        .orderBy(translations.languageCode);
      expect(rows.map(row => row.languageCode)).toEqual(['en', 'ja']);
    });

    it('copies source posters whose url the target lacks', async () => {
      const rows = await database
        .select({url: posterUrls.url})
        .from(posterUrls)
        .orderBy(posterUrls.url);
      expect(rows.map(row => row.url)).toEqual([
        'https://img.example.com/source.jpg',
        'https://img.example.com/target.jpg',
      ]);
    });

    it('skips source posters whose url the target already has', async () => {
      await database.insert(movies).values({uid: 'source-2', year: 2020});
      await database.insert(posterUrls).values({
        movieUid: 'source-2',
        url: 'https://img.example.com/target.jpg',
      });
      await runBatch(
        database,
        await reassignMovieDependents(database, 'source-2', 'target', {}),
      );

      const rows = await database
        .select({movieUid: posterUrls.movieUid, url: posterUrls.url})
        .from(posterUrls)
        .where(eq(posterUrls.url, 'https://img.example.com/target.jpg'));
      expect(rows).toEqual([
        {movieUid: 'target', url: 'https://img.example.com/target.jpg'},
      ]);
    });
  });

  describe('when translations and posters are not preserved', () => {
    beforeEach(async () => {
      await seedAllDependents(database, 'source');
      await reassign({preserveTranslations: false, preservePosters: false});
    });

    it('deletes the source translations', async () => {
      expect(await database.select().from(translations)).toHaveLength(0);
    });

    it('deletes the source posters', async () => {
      expect(await database.select().from(posterUrls)).toHaveLength(0);
    });
  });
});
