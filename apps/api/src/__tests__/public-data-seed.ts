import {getDatabase} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
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

type Database = ReturnType<typeof getDatabase>;

export const seededPeopleUids = {
  mendes: '11111111-1111-4111-8111-111111111111',
  spacey: '22222222-2222-4222-8222-222222222222',
  hanks: '33333333-3333-4333-8333-333333333333',
};

export async function seedPublicData(database: Database): Promise<void> {
  await database.insert(awardOrganizations).values([
    {uid: 'org-academy', name: 'Academy Awards'},
    {uid: 'org-globe', name: 'Golden Globe Awards'},
  ]);
  await database.insert(awardCategories).values([
    {
      uid: 'cat-picture',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Picture',
    },
    {
      uid: 'cat-director',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Director',
    },
    {
      uid: 'cat-actor',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Actor',
    },
    {
      uid: 'cat-globe-drama',
      organizationUid: 'org-globe',
      name: 'Golden Globe Award for Best Motion Picture – Drama',
    },
    {
      uid: 'cat-globe-director',
      organizationUid: 'org-globe',
      name: 'Golden Globe Award for Best Director',
    },
  ]);
  await database.insert(awardCeremonies).values([
    {
      uid: 'ceremony-2000',
      organizationUid: 'org-academy',
      year: 2000,
      ceremonyNumber: 72,
    },
    {
      uid: 'ceremony-2001',
      organizationUid: 'org-academy',
      year: 2001,
      ceremonyNumber: 73,
    },
    {
      uid: 'ceremony-globe-2000',
      organizationUid: 'org-globe',
      year: 2000,
      ceremonyNumber: 57,
    },
  ]);
  await database.insert(movies).values([
    {uid: 'movie-beauty', year: 1999, originalLanguage: 'en'},
    {uid: 'movie-green', year: 1999, originalLanguage: 'en'},
    {uid: 'movie-gladiator', year: 2000, originalLanguage: 'en'},
    {
      uid: 'movie-deleted',
      year: 2000,
      originalLanguage: 'en',
      deletedAt: 1_700_000_000,
    },
  ]);
  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-beauty',
      languageCode: 'en',
      content: 'American Beauty',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-beauty',
      languageCode: 'ja',
      content: 'アメリカン・ビューティー',
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-green',
      languageCode: 'en',
      content: 'The Green Mile',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-green',
      languageCode: 'ja',
      content: 'グリーンマイル',
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-gladiator',
      languageCode: 'en',
      content: 'Gladiator',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-gladiator',
      languageCode: 'ja',
      content: 'グラディエーター',
    },
    {
      resourceType: 'person_name',
      resourceUid: seededPeopleUids.hanks,
      languageCode: 'ja',
      content: 'トム・ハンクス',
    },
  ]);
  await database.insert(posterUrls).values([
    {
      movieUid: 'movie-beauty',
      url: 'https://example.com/beauty.jpg',
      isPrimary: 1,
    },
    {
      movieUid: 'movie-green',
      url: 'https://example.com/green.jpg',
      isPrimary: 1,
    },
    {
      movieUid: 'movie-gladiator',
      url: 'https://example.com/gladiator.jpg',
      isPrimary: 1,
    },
  ]);
  await database.insert(articleLinks).values([
    {
      movieUid: 'movie-beauty',
      url: 'https://example.com/beauty',
      title: 'Review',
    },
    {
      movieUid: 'movie-green',
      url: 'https://example.com/green',
      title: 'Review',
    },
    {
      movieUid: 'movie-gladiator',
      url: 'https://example.com/gladiator',
      title: 'Review',
    },
  ]);
  await database.insert(movieAvailabilityChecks).values(
    ['movie-beauty', 'movie-green', 'movie-gladiator'].map(movieUid => ({
      movieUid,
      source: 'unext' as const,
      status: 'ok' as const,
      detail: 'https://video.unext.jp/',
    })),
  );
  await database.insert(people).values([
    {uid: seededPeopleUids.mendes, tmdbId: 1, name: 'Sam Mendes'},
    {uid: seededPeopleUids.spacey, tmdbId: 2, name: 'Kevin Spacey'},
    {uid: seededPeopleUids.hanks, tmdbId: 3, name: 'Tom Hanks'},
  ]);
  await database.insert(movieCredits).values([
    {
      movieUid: 'movie-beauty',
      personUid: seededPeopleUids.mendes,
      creditId: 'credit-1',
      department: 'Directing',
      job: 'Director',
    },
    {
      movieUid: 'movie-beauty',
      personUid: seededPeopleUids.spacey,
      creditId: 'credit-2',
      department: 'Acting',
      character: 'Lester Burnham',
      castOrder: 0,
    },
    {
      movieUid: 'movie-green',
      personUid: seededPeopleUids.hanks,
      creditId: 'credit-3',
      department: 'Acting',
      character: 'Paul Edgecomb',
      castOrder: 0,
    },
    {
      movieUid: 'movie-gladiator',
      personUid: seededPeopleUids.hanks,
      creditId: 'credit-4',
      department: 'Acting',
      character: 'Narrator',
      castOrder: 1,
    },
  ]);
  await database.insert(nominations).values([
    {
      movieUid: 'movie-beauty',
      ceremonyUid: 'ceremony-2000',
      categoryUid: 'cat-picture',
      isWinner: 1,
    },
    {
      movieUid: 'movie-green',
      ceremonyUid: 'ceremony-2000',
      categoryUid: 'cat-picture',
      isWinner: 0,
    },
    {
      movieUid: 'movie-beauty',
      ceremonyUid: 'ceremony-2000',
      categoryUid: 'cat-director',
      personUid: seededPeopleUids.mendes,
      isWinner: 1,
    },
    {
      movieUid: 'movie-beauty',
      ceremonyUid: 'ceremony-2000',
      categoryUid: 'cat-actor',
      personUid: seededPeopleUids.spacey,
      isWinner: 1,
    },
    {
      movieUid: 'movie-green',
      ceremonyUid: 'ceremony-2000',
      categoryUid: 'cat-actor',
      personUid: seededPeopleUids.hanks,
      isWinner: 0,
    },
    {
      movieUid: 'movie-gladiator',
      ceremonyUid: 'ceremony-2001',
      categoryUid: 'cat-picture',
      isWinner: 1,
    },
    {
      movieUid: 'movie-gladiator',
      ceremonyUid: 'ceremony-2001',
      categoryUid: 'cat-actor',
      personUid: seededPeopleUids.hanks,
      isWinner: 0,
    },
    {
      movieUid: 'movie-beauty',
      ceremonyUid: 'ceremony-globe-2000',
      categoryUid: 'cat-globe-drama',
      isWinner: 1,
    },
    {
      movieUid: 'movie-green',
      ceremonyUid: 'ceremony-globe-2000',
      categoryUid: 'cat-globe-drama',
      isWinner: 0,
    },
    {
      movieUid: 'movie-beauty',
      ceremonyUid: 'ceremony-globe-2000',
      categoryUid: 'cat-globe-director',
      personUid: seededPeopleUids.mendes,
      isWinner: 1,
    },
    {
      movieUid: 'movie-green',
      ceremonyUid: 'ceremony-globe-2000',
      categoryUid: 'cat-globe-director',
      personUid: seededPeopleUids.hanks,
      isWinner: 0,
    },
  ]);
}
