import type {getDatabase} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';

type Database = ReturnType<typeof getDatabase>;

const longTitleMovieUid = 'movie-vrt-long-title';
const longNamePersonUid = '44444444-4444-4444-8444-444444444444';

export async function seedLayoutStressData(database: Database) {
  await database
    .insert(movies)
    .values({uid: longTitleMovieUid, year: 2000, originalLanguage: 'de'});
  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: longTitleMovieUid,
      languageCode: 'de',
      content:
        'Donaudampfschifffahrtselektrizitätenhauptbetriebswerkbauunterbeamtengesellschaft',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: longTitleMovieUid,
      languageCode: 'ja',
      content:
        'ドナウ汽船電気事業本工場工事部門下級官吏組合の長い長い一日とその後の三十年にわたる物語',
    },
    {
      resourceType: 'person_name',
      resourceUid: longNamePersonUid,
      languageCode: 'ja',
      content:
        'フリードリヒ・ヴィルヘルム・マクシミリアン・フォン・ホーエンツォレルン＝ジグマリンゲン',
    },
  ]);
  await database.insert(people).values({
    uid: longNamePersonUid,
    tmdbId: 4,
    name: 'Friedrich Wilhelm Maximilian von Hohenzollern-Sigmaringen',
  });
  await database.insert(movieCredits).values({
    movieUid: longTitleMovieUid,
    personUid: longNamePersonUid,
    creditId: 'credit-vrt-1',
    department: 'Directing',
    job: 'Director',
  });
  await database.insert(nominations).values([
    {
      movieUid: longTitleMovieUid,
      ceremonyUid: 'ceremony-2001',
      categoryUid: 'cat-picture',
      isWinner: 0,
    },
    {
      movieUid: longTitleMovieUid,
      ceremonyUid: 'ceremony-2001',
      categoryUid: 'cat-director',
      personUid: longNamePersonUid,
      isWinner: 1,
    },
  ]);
}
