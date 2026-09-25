import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {and, eq, getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {NotFoundError} from '../errors';
import {MovieTranslationsService} from '../movie-translations-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

type Database = ReturnType<typeof getDatabase>;

async function titles(database: Database, movieUid: string) {
  const rows = await database
    .select({
      languageCode: translations.languageCode,
      content: translations.content,
      isDefault: translations.isDefault,
    })
    .from(translations)
    .where(
      and(
        eq(translations.resourceUid, movieUid),
        eq(translations.resourceType, 'movie_title'),
      ),
    )
    .orderBy(translations.languageCode);
  return rows;
}

describe('MovieTranslationsService', () => {
  let environment: Environment;
  let database: Database;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    environment = {
      DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
    };
    database = getDatabase(environment);
    await migrate(database, {migrationsFolder});
    await database.insert(movies).values({uid: 'movie-1', year: 1954});
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'movie-1',
      languageCode: 'en',
      content: 'Seven Samurai',
      isDefault: 1,
    });
  });

  it('題名を足す', async () => {
    await new MovieTranslationsService(environment).addMovieTranslation(
      'movie-1',
      'ja',
      '七人の侍',
    );

    expect(await titles(database, 'movie-1')).toEqual([
      {languageCode: 'en', content: 'Seven Samurai', isDefault: 1},
      {languageCode: 'ja', content: '七人の侍', isDefault: 0},
    ]);
  });

  it('同じ言語の題名は上書きする', async () => {
    await new MovieTranslationsService(environment).addMovieTranslation(
      'movie-1',
      'en',
      'The Seven Samurai',
    );

    expect(await titles(database, 'movie-1')).toEqual([
      {languageCode: 'en', content: 'The Seven Samurai', isDefault: 0},
    ]);
  });

  it('isDefault で足すと他の言語の isDefault を落とす', async () => {
    await new MovieTranslationsService(environment).addMovieTranslation(
      'movie-1',
      'ja',
      '七人の侍',
      true,
    );

    expect(await titles(database, 'movie-1')).toEqual([
      {languageCode: 'en', content: 'Seven Samurai', isDefault: 0},
      {languageCode: 'ja', content: '七人の侍', isDefault: 1},
    ]);
  });

  it('説明文も一緒に保存する', async () => {
    await new MovieTranslationsService(environment).addMovieTranslation(
      'movie-1',
      'ja',
      '七人の侍',
      false,
      '野武士に襲われる村の話',
    );

    const rows = await database
      .select({content: translations.content})
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, 'movie-1'),
          eq(translations.resourceType, 'movie_description'),
          eq(translations.languageCode, 'ja'),
        ),
      );
    expect(rows).toEqual([{content: '野武士に襲われる村の話'}]);
  });

  it('無い映画には NotFoundError', async () => {
    await expect(
      new MovieTranslationsService(environment).addMovieTranslation(
        'nope',
        'ja',
        'x',
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('言語を指定して題名を消す', async () => {
    await new MovieTranslationsService(environment).addMovieTranslation(
      'movie-1',
      'ja',
      '七人の侍',
    );
    await new MovieTranslationsService(environment).deleteMovieTranslation(
      'movie-1',
      'ja',
    );

    expect(await titles(database, 'movie-1')).toEqual([
      {languageCode: 'en', content: 'Seven Samurai', isDefault: 1},
    ]);
  });
});
