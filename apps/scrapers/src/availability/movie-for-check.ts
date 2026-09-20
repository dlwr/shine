import {and, eq, getDatabase} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {hasJapaneseText, deleteNonOkChecks} from '@shine/availability';
import {type LoadedMovie} from './ensure-selection';
type Database = ReturnType<typeof getDatabase>;

export async function loadMovieForCheck(
  database: Database,
  movieUid: string,
): Promise<LoadedMovie> {
  const movieRows = await database
    .select({
      uid: movies.uid,
      year: movies.year,
      imdbId: movies.imdbId,
      tmdbId: movies.tmdbId,
    })
    .from(movies)
    .where(eq(movies.uid, movieUid))
    .limit(1);

  const movie = movieRows[0];
  if (!movie) {
    throw new Error(`Movie not found: ${movieUid}`);
  }

  const titleRows = await database
    .select({
      languageCode: translations.languageCode,
      content: translations.content,
    })
    .from(translations)
    .where(
      and(
        eq(translations.resourceUid, movieUid),
        eq(translations.resourceType, 'movie_title'),
      ),
    );

  const japaneseTitles = titleRows.filter(row => row.languageCode === 'ja');
  const otherTitles = titleRows.filter(row => row.languageCode !== 'ja');
  const titles = [...japaneseTitles, ...otherTitles]
    .map(row => row.content)
    .filter(title => title.trim() !== '');

  return {
    uid: movie.uid,
    titles,
    displayTitle: titles[0] ?? movie.uid,
    hasJapaneseTitle: japaneseTitles.some(row => hasJapaneseText(row.content)),
    tmdbId: movie.tmdbId ?? undefined,
    imdbId: movie.imdbId ?? undefined,
    year: movie.year ?? undefined,
  };
}

export async function loadMovieEnsuringJapaneseTitle(
  database: Database,
  movieUid: string,
  options: {
    refreshTmdbData: (movieUid: string, imdbId: string) => Promise<void>;
    fetchJapaneseTitle?: (
      imdbId: string,
      tmdbId: number | undefined,
    ) => Promise<string | undefined>;
    saveJapaneseTitle?: (movieUid: string, title: string) => Promise<void>;
  },
): Promise<LoadedMovie> {
  const movie = await loadMovieForCheck(database, movieUid);
  if (movie.hasJapaneseTitle) {
    return movie;
  }

  if (!movie.imdbId) {
    return {...movie, japaneseTitleMissing: true};
  }

  try {
    await options.refreshTmdbData(movieUid, movie.imdbId);
  } catch (error) {
    console.error(`Failed to refresh TMDb data for ${movieUid}:`, error);
    return {...movie, japaneseTitleMissing: true};
  }

  // 管理APIは既存の翻訳レコードを上書きしないため、
  // ja行が日本語でない場合はTMDbのjaタイトルでupsertする
  if (options.fetchJapaneseTitle && options.saveJapaneseTitle) {
    try {
      const title = await options.fetchJapaneseTitle(
        movie.imdbId,
        movie.tmdbId,
      );
      if (title && hasJapaneseText(title)) {
        await options.saveJapaneseTitle(movieUid, title);
      }
    } catch (error) {
      console.error(`Failed to fetch Japanese title for ${movieUid}:`, error);
    }
  }

  const reloaded = await loadMovieForCheck(database, movieUid);
  if (!reloaded.hasJapaneseTitle) {
    return {...reloaded, japaneseTitleMissing: true};
  }

  // 検索の前提となるタイトルが変わったので、過去のng/error判定は破棄する
  await deleteNonOkChecks(database, movieUid);
  return {...reloaded, fetchedJapaneseTitle: reloaded.titles[0]};
}
