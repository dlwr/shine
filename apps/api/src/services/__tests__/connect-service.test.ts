import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {ConnectService} from '../connect-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

type TestDatabase = ReturnType<typeof getDatabase>;

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: TestDatabase;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-connect-'));
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return {environment, database};
}

async function seedMovie(
  database: TestDatabase,
  uid: string,
  options: {deletedAt?: number; withoutJaTitle?: boolean} = {},
) {
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
}

let personCount = 0;

async function seedPerson(database: TestDatabase, uid: string) {
  personCount += 1;
  await database
    .insert(people)
    .values({uid, tmdbId: personCount, name: `${uid}さん`});
}

async function credit(
  database: TestDatabase,
  movieUid: string,
  personUid: string,
  department: 'Acting' | 'Directing' | 'Writing',
) {
  await database.insert(movieCredits).values({
    movieUid,
    personUid,
    creditId: `credit-${movieUid}-${personUid}-${department}`,
    department,
    job: department === 'Directing' ? 'Director' : undefined,
  });
}

async function seedChain(database: TestDatabase, length: number) {
  for (let index = 0; index <= length; index++) {
    await seedMovie(database, `m${index}`);
  }

  for (let index = 1; index <= length; index++) {
    await seedPerson(database, `p${index}`);
    await credit(database, `m${index - 1}`, `p${index}`, 'Acting');
    await credit(database, `m${index}`, `p${index}`, 'Acting');
  }
}

describe('ConnectService.connect', () => {
  let environment: Environment;
  let database: TestDatabase;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  it('同じ人物が出た 2 本を 1 人でつなぐ', async () => {
    await seedChain(database, 1);

    const connection = await new ConnectService(environment).connect(
      'm0',
      'm1',
    );

    expect(connection?.links).toEqual([
      {
        person: {uid: 'p1', name: 'p1さん'},
        role: 'cast',
        movie: {uid: 'm1', title: 'm1の邦題', year: 2000},
      },
    ]);
  });

  it('3 人をはさむ 2 本をつなぐ', async () => {
    await seedChain(database, 3);

    const connection = await new ConnectService(environment).connect(
      'm0',
      'm3',
    );

    expect(connection?.links?.map(link => link.person.uid)).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
  });

  it('4 人をはさむ 2 本はつながらない', async () => {
    await seedChain(database, 4);

    const connection = await new ConnectService(environment).connect(
      'm0',
      'm4',
    );

    expect(connection?.links).toBeUndefined();
  });

  it('つながらなくても 2 本の題名を返す', async () => {
    await seedChain(database, 4);

    const connection = await new ConnectService(environment).connect(
      'm0',
      'm4',
    );

    expect(connection?.to.title).toBe('m4の邦題');
  });

  it('邦題が無ければ原題を出す', async () => {
    await seedMovie(database, 'm0');
    await seedMovie(database, 'm1', {withoutJaTitle: true});

    const connection = await new ConnectService(environment).connect(
      'm0',
      'm1',
    );

    expect(connection?.to.title).toBe('m1 title');
  });

  it('削除された映画は経路に使わない', async () => {
    await seedChain(database, 2);
    await database
      .update(movies)
      .set({deletedAt: 1})
      .where(eq(movies.uid, 'm1'));

    const connection = await new ConnectService(environment).connect(
      'm0',
      'm2',
    );

    expect(connection?.links).toBeUndefined();
  });

  it('脚本などのクレジットではつながない', async () => {
    await seedMovie(database, 'm0');
    await seedMovie(database, 'm1');
    await seedPerson(database, 'p1');
    await credit(database, 'm0', 'p1', 'Writing');
    await credit(database, 'm1', 'p1', 'Writing');

    const connection = await new ConnectService(environment).connect(
      'm0',
      'm1',
    );

    expect(connection?.links).toBeUndefined();
  });

  it('監督と出演でつながる人物は役割を両方にする', async () => {
    await seedMovie(database, 'm0');
    await seedMovie(database, 'm1');
    await seedPerson(database, 'p1');
    await credit(database, 'm0', 'p1', 'Directing');
    await credit(database, 'm1', 'p1', 'Acting');

    const connection = await new ConnectService(environment).connect(
      'm0',
      'm1',
    );

    expect(connection?.links?.[0].role).toBe('director-and-cast');
  });

  it('同じ長さの経路が複数あれば uid の若い人物を通る', async () => {
    await seedMovie(database, 'm0');
    await seedMovie(database, 'm1');
    await seedPerson(database, 'p2');
    await seedPerson(database, 'p1');
    await credit(database, 'm0', 'p2', 'Acting');
    await credit(database, 'm1', 'p2', 'Acting');
    await credit(database, 'm0', 'p1', 'Acting');
    await credit(database, 'm1', 'p1', 'Acting');

    const connection = await new ConnectService(environment).connect(
      'm0',
      'm1',
    );

    expect(connection?.links?.[0].person.uid).toBe('p1');
  });

  it('削除された映画を選ぶと何も返さない', async () => {
    await seedMovie(database, 'm0');
    await seedMovie(database, 'm1', {deletedAt: 1});

    const connection = await new ConnectService(environment).connect(
      'm0',
      'm1',
    );

    expect(connection).toBeUndefined();
  });
});

async function nominate(database: TestDatabase, movieUids: string[]) {
  await database
    .insert(awardOrganizations)
    .values({uid: 'org', name: 'Academy Awards'});
  await database.insert(awardCategories).values({
    uid: 'cat',
    organizationUid: 'org',
    name: 'Academy Award for Best Picture',
  });
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony', organizationUid: 'org', year: 2000});
  await database.insert(nominations).values(
    movieUids.map(movieUid => ({
      movieUid,
      ceremonyUid: 'ceremony',
      categoryUid: 'cat',
    })),
  );
}

describe('ConnectService.pick', () => {
  let environment: Environment;
  let database: TestDatabase;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  it('3 人以内でつながる候補作の 2 本を選ぶ', async () => {
    await seedChain(database, 1);
    await seedMovie(database, 'lonely');
    await nominate(database, ['m0', 'm1', 'lonely']);

    const pick = await new ConnectService(environment).pick('2026-09-15');

    expect(new Set([pick?.from, pick?.to])).toEqual(new Set(['m0', 'm1']));
  });

  it('つながる組が無ければ何も返さない', async () => {
    await seedMovie(database, 'm0');
    await seedMovie(database, 'm1');
    await nominate(database, ['m0', 'm1']);

    const pick = await new ConnectService(environment).pick('2026-09-15');

    expect(pick).toBeUndefined();
  });
});
