import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {ShiritoriService} from '../shiritori-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

type TestDatabase = ReturnType<typeof getDatabase>;

async function seedMovie(
  database: TestDatabase,
  uid: string,
  title: string,
  options: {deletedAt?: number; languageCode?: string} = {},
) {
  await database
    .insert(movies)
    .values({uid, year: 2000, deletedAt: options.deletedAt});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: uid,
    languageCode: options.languageCode ?? 'ja',
    content: title,
  });
}

describe('ShiritoriService.loadIndex', () => {
  let environment: Environment;
  let database: TestDatabase;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'shine-shiritori-'),
    );
    environment = {
      DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
    };
    database = getDatabase(environment);
    await migrate(database, {migrationsFolder});
  });

  it('邦題の最初と最後の字を返す', async () => {
    await seedMovie(database, 'movie-totoro', 'となりのトトロ');

    const index = await new ShiritoriService(environment).loadIndex();

    expect(index).toEqual([
      {
        uid: 'movie-totoro',
        title: 'となりのトトロ',
        year: 2000,
        first: 'と',
        last: 'ろ',
        watchable: false,
      },
    ]);
  });

  it('かなで始まらない邦題は除く', async () => {
    await seedMovie(database, 'movie-seven', '七人の侍');

    expect(await new ShiritoriService(environment).loadIndex()).toEqual([]);
  });

  it('邦題でない題名は除く', async () => {
    await seedMovie(database, 'movie-en', 'トトロ', {languageCode: 'en'});

    expect(await new ShiritoriService(environment).loadIndex()).toEqual([]);
  });

  it('削除された映画は除く', async () => {
    await seedMovie(database, 'movie-deleted', 'トトロ', {deletedAt: 1});

    expect(await new ShiritoriService(environment).loadIndex()).toEqual([]);
  });

  it('日本で観られる映画に印を付ける', async () => {
    await seedMovie(database, 'movie-totoro', 'となりのトトロ');
    await database.insert(movieAvailabilityChecks).values({
      movieUid: 'movie-totoro',
      source: 'unext',
      status: 'ok',
      checkedAt: 1,
    });

    const [entry] = await new ShiritoriService(environment).loadIndex();

    expect(entry.watchable).toBe(true);
  });

  it('uid の順に並べる', async () => {
    await seedMovie(database, 'movie-c', 'ろば');
    await seedMovie(database, 'movie-a', 'とら');
    await seedMovie(database, 'movie-b', 'らくだ');

    const index = await new ShiritoriService(environment).loadIndex();

    expect(index.map(entry => entry.uid)).toEqual([
      'movie-a',
      'movie-b',
      'movie-c',
    ]);
  });
});
