import {eq} from 'drizzle-orm';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import {getScrapeDatabase} from '../common/dry-run';
import {fetchTMDBMovieImages, fetchTMDBMovieSummary} from '@shine/tmdb';
import {
  fetchJapaneseTitleFromTMDB,
  saveJapaneseTranslation,
  savePosterUrls,
  saveTMDBId,
} from '@shine/tmdb/persistence';
import {fetchMainData, getOrCreateCeremony} from './award-records';
import {findExistingMovie} from './existing-movie';
import {type ScrapeContext} from './types';

export type MovieBatchData = {
  translations: Array<typeof translations.$inferInsert>;
  referenceUrl?: typeof referenceUrls.$inferInsert;
  nomination?: typeof nominations.$inferInsert;
};

export async function processMovieForBatch(
  context: ScrapeContext,
  title: string,
  year: number,
  isWinner: boolean,
  referenceUrl?: string,
): Promise<MovieBatchData | undefined> {
  try {
    const main = await fetchMainData(context);
    const database = getScrapeDatabase(context);

    if (context.isDryRun) {
      const existing = await findExistingMovie(database, title, undefined);
      console.log(
        `[DRY RUN] Would process ${existing.status} movie: ${title} (${year}) - ${
          isWinner ? 'Winner' : 'Nominee'
        }`,
      );
      return undefined;
    }

    // IMDb IDと原語を取得
    let imdbId: string | undefined;
    let originalLanguage: string | undefined;
    if (context.tmdbApiKey) {
      const summary = await fetchTMDBMovieSummary(
        title,
        year,
        context.tmdbApiKey,
      );
      imdbId = summary.imdbId;
      originalLanguage = summary.originalLanguage;
    }

    const existing = await findExistingMovie(database, title, imdbId);

    if (existing.status === 'soft-deleted') {
      console.log(`Skipping soft-deleted movie: ${title} (${imdbId})`);
      return undefined;
    }

    const isNewMovie = existing.status === 'missing';
    let movieUid: string;
    const translationsBatch: Array<typeof translations.$inferInsert> = [];

    if (existing.status === 'active') {
      movieUid = existing.uid;
      // IMDb IDが新しく取得できた場合は更新（差分チェック付き）
      if (imdbId && !existing.imdbId) {
        await database
          .update(movies)
          .set({
            imdbId,
          })
          .where(eq(movies.uid, movieUid));
        console.log(`Updated IMDb ID for ${title}: ${imdbId}`);
      }
    } else {
      // 新規映画の作成
      const [newMovie] = await database
        .insert(movies)
        .values({
          originalLanguage: originalLanguage ?? 'en',
          year,
          imdbId: imdbId || undefined,
        })
        .returning();
      if (!newMovie) {
        throw new Error(`Failed to create movie: ${title}`);
      }

      movieUid = newMovie.uid;
      // 英語タイトルをバッチに追加
      translationsBatch.push({
        resourceType: 'movie_title',
        resourceUid: movieUid,
        languageCode: 'en',
        content: title,
        isDefault: 1,
      });
    }

    // 参照URL
    let referenceUrlData: typeof referenceUrls.$inferInsert | undefined;
    if (referenceUrl) {
      referenceUrlData = {
        movieUid,
        url: referenceUrl,
        sourceType: 'wikipedia',
        languageCode: 'en',
        isPrimary: 1,
      };
    }

    // ノミネーション
    const ceremonyUid = await getOrCreateCeremony(
      context,
      year,
      main.organizationUid,
    );
    const nominationData: typeof nominations.$inferInsert = {
      movieUid,
      ceremonyUid,
      categoryUid: main.categoryUid,
      isWinner: isWinner ? 1 : 0,
    };

    // 日本語タイトルとポスターの処理（新規映画の場合のみ）
    if (isNewMovie && imdbId && context.tmdbApiKey) {
      // 日本語タイトルの取得・保存
      const japaneseTitle = await fetchJapaneseTitleFromTMDB(
        imdbId,
        undefined,
        context.environment,
      );
      if (japaneseTitle) {
        await saveJapaneseTranslation(
          movieUid,
          japaneseTitle,
          context.environment,
        );
      }

      // ポスターの取得・保存
      try {
        const movieImages = await fetchTMDBMovieImages(
          imdbId,
          context.tmdbApiKey,
        );
        if (movieImages) {
          // TMDB IDを保存（まだ保存されていない場合）
          const currentMovie = await database
            .select({tmdbId: movies.tmdbId})
            .from(movies)
            .where(eq(movies.uid, movieUid))
            .limit(1);
          if (currentMovie.length > 0 && !currentMovie[0].tmdbId) {
            await saveTMDBId(
              imdbId,
              movieImages.tmdbId,
              context.environment,
              movieImages.mediaType,
            );
          }

          // ポスターを保存
          const posterCount = await savePosterUrls(
            movieUid,
            movieImages.images.posters,
            context.environment,
          );
          if (posterCount > 0) {
            console.log(`  Saved ${posterCount} posters for ${title}`);
          }
        }
      } catch (error) {
        console.error(`ポスターの取得に失敗しました: ${title}`, error);
      }
    }

    console.log(
      `Processed ${
        isNewMovie ? 'new' : 'updated'
      } movie: ${title} (${year}) - ${isWinner ? 'Winner' : 'Nominee'} ${
        imdbId ? `IMDb: ${imdbId}` : ''
      }`,
    );

    return {
      translations: translationsBatch,
      referenceUrl: referenceUrlData,
      nomination: nominationData,
    };
  } catch (error) {
    console.error(`Error processing movie ${title}:`, error);
    return undefined;
  }
}
