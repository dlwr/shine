import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {createD1TestDatabase} from '@shine/database/testing';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {PeopleService} from '../people-service';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../packages/database/migrations',
);

describe('PeopleService on D1', () => {
  let service: PeopleService;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const d1 = await createD1TestDatabase({migrationsFolder});
    dispose = d1.dispose;
    const {database} = d1;
    await database.insert(awardOrganizations).values({
      uid: 'org-japan-academy',
      name: 'Japan Academy Awards',
    });
    await database.insert(awardCategories).values({
      uid: 'cat-director',
      organizationUid: 'org-japan-academy',
      name: '監督賞',
    });
    await database.insert(awardCeremonies).values({
      uid: 'ceremony-2000',
      organizationUid: 'org-japan-academy',
      year: 2000,
    });
    for (let index = 0; index < 24; index += 1) {
      await database.insert(movies).values({uid: `movie-${index}`, year: 2000});
      await database.insert(people).values({
        uid: `person-${index}`,
        tmdbId: index + 1,
        name: `監督${index}`,
      });
      await database.insert(nominations).values({
        uid: `nomination-${index}`,
        movieUid: `movie-${index}`,
        ceremonyUid: 'ceremony-2000',
        categoryUid: 'cat-director',
        personUid: `person-${index}`,
        isWinner: 1,
      });
    }
    service = new PeopleService({
      DB: d1.binding,
    });
  }, 60_000);

  afterAll(async () => {
    await dispose?.();
  });

  it('loads the top movies of every ranked director', async () => {
    const {directors} = await service.getProminentPeople({locale: 'ja'});

    expect(directors.every(director => director.topMovies.length === 1)).toBe(
      true,
    );
  });
});
