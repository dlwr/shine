import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {and, eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {describe, expect, it} from 'vitest';
import {type ResolvedFilm} from '../common/wikidata-film-resolver';
import {backfillJapaneseTitles, type KinemaJunpoEdition} from '../kinema-junpo';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: ReturnType<typeof getDatabase>;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-kinejun-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return {environment, database};
}

const edition: KinemaJunpoEdition = {
  year: 1956,
  japanese: [
    {rank: 1, page: '真昼の暗黒', title: '真昼の暗黒'},
    {rank: 2, page: '夜の河', title: '夜の河'},
    {rank: 3, page: 'ビルマの竪琴', title: 'ビルマの竪琴'},
    {rank: 4, page: 'Karakoram', title: 'Karakoram'},
  ],
  foreign: [],
};

const resolved = new Map<string, ResolvedFilm>([
  ['真昼の暗黒', {imdbId: 'tt0049464'}],
  ['夜の河', {imdbId: 'tt0049796'}],
  ['ビルマの竪琴', {imdbId: 'tt0049012'}],
  ['Karakoram', {imdbId: 'tt0359542'}],
]);

const japaneseTitleOf = async (
  database: ReturnType<typeof getDatabase>,
  movieUid: string,
) => {
  const [row] = await database
    .select({content: translations.content})
    .from(translations)
    .where(
      and(
        eq(translations.resourceUid, movieUid),
        eq(translations.resourceType, 'movie_title'),
        eq(translations.languageCode, 'ja'),
      ),
    );
  return row?.content;
};

describe('backfillJapaneseTitles', () => {
  it('邦題が無い映画にWikipediaの表記を入れる', async () => {
    const {environment, database} = await createTestEnvironment();
    await database
      .insert(movies)
      .values({uid: 'movie-1', imdbId: 'tt0049464', year: 1956});

    await backfillJapaneseTitles({environment, editions: [edition], resolved});

    expect(await japaneseTitleOf(database, 'movie-1')).toBe('真昼の暗黒');
  });

  it('原題のまま保存されている邦題を置き換える', async () => {
    const {environment, database} = await createTestEnvironment();
    await database
      .insert(movies)
      .values({uid: 'movie-2', imdbId: 'tt0049796', year: 1956});
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'movie-2',
      languageCode: 'ja',
      content: 'Yoru no kawa',
      isDefault: 0,
    });

    await backfillJapaneseTitles({environment, editions: [edition], resolved});

    expect(await japaneseTitleOf(database, 'movie-2')).toBe('夜の河');
  });

  it('日本語の邦題がすでにある映画は書き換えない', async () => {
    const {environment, database} = await createTestEnvironment();
    await database
      .insert(movies)
      .values({uid: 'movie-3', imdbId: 'tt0049012', year: 1956});
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'movie-3',
      languageCode: 'ja',
      content: 'ビルマの竪琴 (1956年の映画)',
      isDefault: 0,
    });

    await backfillJapaneseTitles({environment, editions: [edition], resolved});

    expect(await japaneseTitleOf(database, 'movie-3')).toBe(
      'ビルマの竪琴 (1956年の映画)',
    );
  });

  it('日本語を含まない表記は邦題として使わない', async () => {
    const {environment, database} = await createTestEnvironment();
    await database
      .insert(movies)
      .values({uid: 'movie-4', imdbId: 'tt0359542', year: 1956});

    await backfillJapaneseTitles({environment, editions: [edition], resolved});

    expect(await japaneseTitleOf(database, 'movie-4')).toBeUndefined();
  });

  it('削除済みの映画には書き込まない', async () => {
    const {environment, database} = await createTestEnvironment();
    await database.insert(movies).values({
      uid: 'movie-5',
      imdbId: 'tt0049464',
      year: 1956,
      deletedAt: 1_700_000_000,
    });

    await backfillJapaneseTitles({environment, editions: [edition], resolved});

    expect(await japaneseTitleOf(database, 'movie-5')).toBeUndefined();
  });

  it('更新件数を返す', async () => {
    const {environment, database} = await createTestEnvironment();
    await database
      .insert(movies)
      .values({uid: 'movie-6', imdbId: 'tt0049464', year: 1956});

    const stats = await backfillJapaneseTitles({
      environment,
      editions: [edition],
      resolved,
    });

    expect(stats.saved).toBe(1);
  });
});
