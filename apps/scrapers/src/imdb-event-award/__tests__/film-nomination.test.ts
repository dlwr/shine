import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, describe, expect, it} from 'vitest';
import {ensureFilmNomination, loadFilmNominations} from '../film-nomination';
import {type AwardFilm, type ImportContext} from '../types';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

let temporaryDirectories: string[] = [];

async function createTestContext() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-film-nomination-'),
  );
  temporaryDirectories.push(directory);
  const database = getDatabase({
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  });
  await migrate(database, {migrationsFolder});

  const [organization] = await database
    .insert(awardOrganizations)
    .values({name: 'Test Festival'})
    .returning();
  const [category] = await database
    .insert(awardCategories)
    .values({organizationUid: organization.uid, name: 'Best Film'})
    .returning();
  const [ceremony] = await database
    .insert(awardCeremonies)
    .values({organizationUid: organization.uid, year: 2024})
    .returning();
  const [movie] = await database
    .insert(movies)
    .values({originalLanguage: 'en', year: 2024, imdbId: 'tt0000001'})
    .returning();

  const context: ImportContext = {
    database,
    config: {
      organizationName: 'Test Festival',
      organizationCountry: 'Italy',
      establishedYear: 1932,
      categoryName: 'Best Film',
      ceremonyNumber: year => year - 1939,
      isCompetitionCategory: () => true,
      minimumFilmsPerEdition: 1,
    },
    tmdbApiKey: undefined,
    throttleMs: 0,
    stats: {
      editionsProcessed: 0,
      moviesCreated: 0,
      moviesExisting: 0,
      skippedSoftDeleted: 0,
      nominationsCreated: 0,
      winnersUpdated: 0,
      tmdbNotFound: 0,
      peopleUnresolved: 0,
      failed: 0,
    },
    personOverrides: new Map(),
  };

  return {
    context,
    database,
    ceremonyUid: ceremony.uid,
    categoryUid: category.uid,
    movieUid: movie.uid,
  };
}

function film(overrides: Partial<AwardFilm> = {}): AwardFilm {
  return {
    imdbId: 'tt0000001',
    title: 'Film',
    originalTitle: 'Film',
    isWinner: false,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('ensureFilmNomination', () => {
  it('無ければノミネーションを作り件数を数える', async () => {
    const {context, database, ceremonyUid, categoryUid, movieUid} =
      await createTestContext();
    const byMovie = await loadFilmNominations(
      context,
      ceremonyUid,
      categoryUid,
    );

    await ensureFilmNomination(
      context,
      movieUid,
      ceremonyUid,
      categoryUid,
      film({specialMention: 'Special Jury Prize'}),
      byMovie,
    );

    const [row] = await database.select().from(nominations);
    expect(row).toMatchObject({
      movieUid,
      isWinner: 0,
      specialMention: 'Special Jury Prize',
    });
    expect(row.personUid).toBeNull();
    expect(context.stats.nominationsCreated).toBe(1);
    expect(byMovie.get(movieUid)).toEqual({
      isWinner: 0,
      specialMention: 'Special Jury Prize',
    });
  });

  it('既存の落選を受賞へ昇格させる', async () => {
    const {context, database, ceremonyUid, categoryUid, movieUid} =
      await createTestContext();
    await database
      .insert(nominations)
      .values({movieUid, ceremonyUid, categoryUid, isWinner: 0});
    const byMovie = await loadFilmNominations(
      context,
      ceremonyUid,
      categoryUid,
    );

    await ensureFilmNomination(
      context,
      movieUid,
      ceremonyUid,
      categoryUid,
      film({isWinner: true}),
      byMovie,
    );

    const [row] = await database.select().from(nominations);
    expect(row.isWinner).toBe(1);
    expect(context.stats.winnersUpdated).toBe(1);
    expect(context.stats.nominationsCreated).toBe(0);
  });

  it('既存の受賞を落選には戻さない', async () => {
    const {context, database, ceremonyUid, categoryUid, movieUid} =
      await createTestContext();
    await database
      .insert(nominations)
      .values({movieUid, ceremonyUid, categoryUid, isWinner: 1});
    const byMovie = await loadFilmNominations(
      context,
      ceremonyUid,
      categoryUid,
    );

    await ensureFilmNomination(
      context,
      movieUid,
      ceremonyUid,
      categoryUid,
      film({isWinner: false}),
      byMovie,
    );

    const [row] = await database.select().from(nominations);
    expect(row.isWinner).toBe(1);
    expect(context.stats.winnersUpdated).toBe(0);
  });

  it('特別言及が変わっていれば更新する', async () => {
    const {context, database, ceremonyUid, categoryUid, movieUid} =
      await createTestContext();
    await database.insert(nominations).values({
      movieUid,
      ceremonyUid,
      categoryUid,
      isWinner: 0,
      specialMention: 'old',
    });
    const byMovie = await loadFilmNominations(
      context,
      ceremonyUid,
      categoryUid,
    );

    await ensureFilmNomination(
      context,
      movieUid,
      ceremonyUid,
      categoryUid,
      film({specialMention: 'new'}),
      byMovie,
    );

    const [row] = await database.select().from(nominations);
    expect(row.specialMention).toBe('new');
    expect(byMovie.get(movieUid)?.specialMention).toBe('new');
  });

  it('特別言及の指定が無ければ既存の値を消さない', async () => {
    const {context, database, ceremonyUid, categoryUid, movieUid} =
      await createTestContext();
    await database.insert(nominations).values({
      movieUid,
      ceremonyUid,
      categoryUid,
      isWinner: 0,
      specialMention: 'kept',
    });
    const byMovie = await loadFilmNominations(
      context,
      ceremonyUid,
      categoryUid,
    );

    await ensureFilmNomination(
      context,
      movieUid,
      ceremonyUid,
      categoryUid,
      film(),
      byMovie,
    );

    const [row] = await database.select().from(nominations);
    expect(row.specialMention).toBe('kept');
  });
});

describe('loadFilmNominations', () => {
  it('個人賞の行は読まない', async () => {
    const {context, database, ceremonyUid, categoryUid, movieUid} =
      await createTestContext();
    const [person] = await database
      .insert(people)
      .values({tmdbId: 1, name: 'Someone'})
      .returning();
    await database.insert(nominations).values([
      {movieUid, ceremonyUid, categoryUid, isWinner: 1},
      {movieUid, ceremonyUid, categoryUid, isWinner: 0, personUid: person.uid},
    ]);

    const byMovie = await loadFilmNominations(
      context,
      ceremonyUid,
      categoryUid,
    );

    expect(byMovie.keys().toArray()).toEqual([movieUid]);
    expect(byMovie.get(movieUid)?.isWinner).toBe(1);
    expect(byMovie.get(movieUid)?.specialMention).toBeNull();
  });
});
