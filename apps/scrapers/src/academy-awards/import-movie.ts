import {and, eq, isNull} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
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

type MainData = {
  organizationUid: string;
  categoryUid: string;
  ceremonies: Map<number, string>;
};

export type ScrapeContext = {
  environment: Environment;
  tmdbApiKey: string | undefined;
  isDryRun: boolean;
};

export type MovieBatchData = {
  translations: Array<typeof translations.$inferInsert>;
  referenceUrl?: typeof referenceUrls.$inferInsert;
  nomination?: typeof nominations.$inferInsert;
};

const fetchMainData = (() => {
  let mainData: MainData | undefined;

  return async function fetchMainData(
    context: ScrapeContext,
  ): Promise<MainData> {
    if (mainData) {
      return mainData;
    }

    const [organization] = await getDatabase(context.environment)
      .select()
      .from(awardOrganizations)
      .where(eq(awardOrganizations.name, 'Academy Awards'));

    if (!organization) {
      throw new Error('Academy Awards organization not found');
    }

    const [category] = await getDatabase(context.environment)
      .select()
      .from(awardCategories)
      .where(
        and(
          eq(awardCategories.shortName, 'Best Picture'),
          eq(awardCategories.organizationUid, organization.uid),
        ),
      );

    if (!category) {
      throw new Error('Best Picture category not found');
    }

    const ceremoniesData = await getDatabase(context.environment)
      .select()
      .from(awardCeremonies)
      .where(eq(awardCeremonies.organizationUid, organization.uid));

    const ceremonies = new Map<number, string>(
      ceremoniesData.map(ceremony => [ceremony.year, ceremony.uid]),
    );

    mainData = {
      organizationUid: organization.uid,
      categoryUid: category.uid,
      ceremonies,
    };

    return mainData;
  };
})();

async function getOrCreateCeremony(
  context: ScrapeContext,
  year: number,
  organizationUid: string,
): Promise<string> {
  const database = getScrapeDatabase(context);
  const [ceremony] = await database
    .insert(awardCeremonies)
    .values({
      organizationUid,
      year,
      ceremonyNumber: year - 1928 + 1,
    })
    .onConflictDoUpdate({
      target: [awardCeremonies.organizationUid, awardCeremonies.year],
      set: {
        ceremonyNumber: year - 1928 + 1,
      },
    })
    .returning();

  const main = await fetchMainData(context);
  main.ceremonies.set(year, ceremony.uid);

  return ceremony.uid;
}

type DatabaseClient = ReturnType<typeof getDatabase>;

type ExistingMovie =
  | {status: 'active'; uid: string; imdbId: string | null}
  | {status: 'soft-deleted'}
  | {status: 'missing'};

async function findExistingMovie(
  database: DatabaseClient,
  title: string,
  imdbId: string | undefined,
): Promise<ExistingMovie> {
  if (imdbId) {
    const [movieWithImdbId] = await database
      .select({
        uid: movies.uid,
        imdbId: movies.imdbId,
        deletedAt: movies.deletedAt,
      })
      .from(movies)
      .where(eq(movies.imdbId, imdbId))
      .limit(1);

    if (movieWithImdbId) {
      return movieWithImdbId.deletedAt === null
        ? {
            status: 'active',
            uid: movieWithImdbId.uid,
            imdbId: movieWithImdbId.imdbId,
          }
        : {status: 'soft-deleted'};
    }
  }

  const [movieWithTitle] = await database
    .select({uid: movies.uid, imdbId: movies.imdbId})
    .from(movies)
    .innerJoin(
      translations,
      and(
        eq(translations.resourceUid, movies.uid),
        eq(translations.resourceType, 'movie_title'),
        eq(translations.languageCode, 'en'),
      ),
    )
    .where(and(eq(translations.content, title), isNull(movies.deletedAt)))
    .limit(1);

  return movieWithTitle
    ? {status: 'active', uid: movieWithTitle.uid, imdbId: movieWithTitle.imdbId}
    : {status: 'missing'};
}

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
