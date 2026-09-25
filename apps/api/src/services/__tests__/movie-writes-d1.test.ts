import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {and, eq, type Environment, type getDatabase} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {createD1TestDatabase} from '@shine/database/testing';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {MovieMergeService} from '../movie-merge-service';
import {MovieTranslationsService} from '../movie-translations-service';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../packages/database/migrations',
);

describe('movie writes on D1', () => {
  let database: ReturnType<typeof getDatabase>;
  let environment: Environment;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const d1 = await createD1TestDatabase({migrationsFolder});
    ({database, dispose} = d1);
    environment = {
      TURSO_DATABASE_URL: '',
      TURSO_AUTH_TOKEN: '',
      DB: d1.binding,
    };
  }, 60_000);

  afterAll(async () => {
    await dispose?.();
  });

  it('deletes a movie with its translations', async () => {
    await database.insert(movies).values({uid: 'delete-me', year: 2000});
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'delete-me',
      languageCode: 'ja',
      content: '消える映画',
    });

    await new MovieMergeService(environment).deleteMovie('delete-me');

    const rows = await database
      .select({uid: movies.uid})
      .from(movies)
      .where(eq(movies.uid, 'delete-me'));
    expect(rows).toEqual([]);
  });

  it('moves the posters of a merged movie to the target', async () => {
    await database.insert(movies).values([
      {uid: 'merge-source', year: 2001},
      {uid: 'merge-target', year: 2001},
    ]);
    await database.insert(posterUrls).values({
      movieUid: 'merge-source',
      url: 'https://example.com/poster.jpg',
    });

    await new MovieMergeService(environment).mergeMovies({
      sourceMovieId: 'merge-source',
      targetMovieId: 'merge-target',
    });

    const rows = await database
      .select({url: posterUrls.url})
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, 'merge-target'));
    expect(rows).toEqual([{url: 'https://example.com/poster.jpg'}]);
  });

  it('replaces the default title of a movie', async () => {
    await database.insert(movies).values({uid: 'retitle', year: 2002});
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'retitle',
      languageCode: 'en',
      content: 'Old Title',
      isDefault: 1,
    });

    await new MovieTranslationsService(environment).addMovieTranslation(
      'retitle',
      'ja',
      '新しい題名',
      true,
    );

    const rows = await database
      .select({languageCode: translations.languageCode})
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, 'retitle'),
          eq(translations.isDefault, 1),
        ),
      );
    expect(rows).toEqual([{languageCode: 'ja'}]);
  });
});
