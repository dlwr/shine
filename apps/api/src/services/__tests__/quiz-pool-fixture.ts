import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

export type Database = ReturnType<typeof getDatabase>;

export async function addToPool(
  database: Database,
  uids: string[],
): Promise<void> {
  await database
    .insert(movies)
    .values(uids.map(uid => ({uid, year: 1965, originalLanguage: 'ja'})));
  await database.insert(translations).values(
    uids.map(uid => ({
      resourceType: 'movie_title' as const,
      resourceUid: uid,
      languageCode: 'ja',
      content: uid,
      isDefault: 1,
    })),
  );
  await database.insert(posterUrls).values(
    uids.map(uid => ({
      movieUid: uid,
      url: `https://example.com/${uid}.jpg`,
      isPrimary: 1,
    })),
  );
  await database.insert(nominations).values(
    uids.flatMap(uid =>
      ['cannes', 'kinema'].map(organization => ({
        movieUid: uid,
        ceremonyUid: `ceremony-${organization}`,
        categoryUid: `cat-${organization}`,
        isWinner: 1,
      })),
    ),
  );
}

export async function createEnvironment(
  poolSize: number,
): Promise<{environment: Environment; database: Database}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-quiz-sel-'));
  const environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  } as Environment;
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(awardOrganizations).values([
    {uid: 'org-cannes', name: 'Cannes Film Festival'},
    {uid: 'org-kinema', name: 'Kinema Junpo'},
  ]);
  await database.insert(awardCategories).values([
    {uid: 'cat-cannes', organizationUid: 'org-cannes', name: "Palme d'Or"},
    {uid: 'cat-kinema', organizationUid: 'org-kinema', name: 'Best Ten'},
  ]);
  await database.insert(awardCeremonies).values([
    {uid: 'ceremony-cannes', organizationUid: 'org-cannes', year: 2000},
    {uid: 'ceremony-kinema', organizationUid: 'org-kinema', year: 2000},
  ]);

  await addToPool(
    database,
    Array.from(
      {length: poolSize},
      (_, index) => `movie-${String(index).padStart(3, '0')}`,
    ),
  );

  return {environment, database};
}
