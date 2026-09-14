import {and, eq, type getDatabase} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import puppeteer from '@cloudflare/puppeteer';
import {BaseService} from './base-service';
import {
  ConflictError,
  ExternalFetchError,
  NotFoundError,
  TmdbConfigError,
  TmdbDataNotFoundError,
  UnprocessableContentError,
  ValidationError,
} from './errors';
import {
  type ImdbNextData,
  extractImdbNominations,
  normalizeCategoryName,
} from './imdb-matching';
import {MovieImportService} from './movie-import-service';

const AWARD_SYNONYM_GROUPS: string[][] = [
  [
    "palme d'or",
    'grand prize of the festival',
    'grand prix du festival',
    'golden palm',
  ].map(s => normalizeCategoryName(s)),
  ['grand prix', 'grand prize of the jury', 'grand prize'].map(s =>
    normalizeCategoryName(s),
  ),
];

const ensureTrailingSlash = (value: string): string =>
  value.endsWith('/') ? value : `${value}/`;

type Database = ReturnType<typeof getDatabase>;

async function findMovieByImdbId(database: Database, imdbId: string) {
  const [movie] = await database
    .select({uid: movies.uid, deletedAt: movies.deletedAt})
    .from(movies)
    .where(eq(movies.imdbId, imdbId))
    .limit(1);
  return movie;
}

export async function ensureNominationMovies(
  database: Database,
  movieImport: Pick<MovieImportService, 'createMovieFromImdbId'>,
  imdbNominations: Array<{imdbId?: string}>,
): Promise<{
  ensuredMovies: Map<string, string>;
  moviesCreated: number;
  skipped: number;
}> {
  let moviesCreated = 0;
  let skipped = 0;
  const ensuredMovies = new Map<string, string>();
  const deletedImdbIds = new Set<string>();

  for (const nomination of imdbNominations) {
    if (!nomination.imdbId) {
      skipped++;
      continue;
    }

    if (
      ensuredMovies.has(nomination.imdbId) ||
      deletedImdbIds.has(nomination.imdbId)
    ) {
      continue;
    }

    const existing = await findMovieByImdbId(database, nomination.imdbId);

    if (existing?.deletedAt) {
      deletedImdbIds.add(nomination.imdbId);
      skipped++;
      continue;
    }

    if (existing) {
      ensuredMovies.set(nomination.imdbId, existing.uid);
      continue;
    }

    try {
      const created = await movieImport.createMovieFromImdbId(
        nomination.imdbId,
      );
      ensuredMovies.set(nomination.imdbId, created.movie.uid);
      moviesCreated++;
    } catch (error) {
      console.error(
        `[imdb-sync] createMovie error for ${nomination.imdbId}:`,
        error instanceof Error ? error.message : error,
      );
      if (
        error instanceof TmdbConfigError ||
        error instanceof TmdbDataNotFoundError
      ) {
        const fallback = await movieImport.createMovieFromImdbId(
          nomination.imdbId,
          {
            fetchTMDBData: false,
          },
        );
        ensuredMovies.set(nomination.imdbId, fallback.movie.uid);
        moviesCreated++;
        continue;
      }

      if (error instanceof ConflictError) {
        const recheck = await findMovieByImdbId(database, nomination.imdbId);

        if (recheck && !recheck.deletedAt) {
          ensuredMovies.set(nomination.imdbId, recheck.uid);
          continue;
        }
      }

      throw error;
    }
  }

  return {ensuredMovies, moviesCreated, skipped};
}

export class CeremonyNominationSyncService extends BaseService {
  async syncCeremonyNominationsFromImdb(
    ceremonyUid: string,
    options: {categoryUid: string},
  ): Promise<{
    moviesCreated: number;
    nominationsInserted: number;
    skipped: number;
    imdbEntries: number;
    categoryName: string;
  }> {
    const trimmedCategoryUid = options.categoryUid?.trim();

    if (!trimmedCategoryUid) {
      throw new ValidationError('Category UID is required');
    }

    const ceremonyRows = await this.database
      .select({
        uid: awardCeremonies.uid,
        organizationUid: awardCeremonies.organizationUid,
        imdbEventUrl: awardCeremonies.imdbEventUrl,
      })
      .from(awardCeremonies)
      .where(eq(awardCeremonies.uid, ceremonyUid))
      .limit(1);

    const ceremony = ceremonyRows[0];
    if (!ceremony) {
      throw new NotFoundError('Ceremony not found');
    }

    const imdbEventUrl = ceremony.imdbEventUrl?.trim();
    if (!imdbEventUrl) {
      throw new ValidationError(
        'Ceremony does not have an IMDb event URL configured',
      );
    }

    const categoryRows = await this.database
      .select({
        uid: awardCategories.uid,
        organizationUid: awardCategories.organizationUid,
        name: awardCategories.name,
      })
      .from(awardCategories)
      .where(eq(awardCategories.uid, trimmedCategoryUid))
      .limit(1);

    const category = categoryRows[0];
    if (!category) {
      throw new NotFoundError('Category not found');
    }

    if (category.organizationUid !== ceremony.organizationUid) {
      throw new ValidationError(
        'Category does not belong to the ceremony organization',
      );
    }

    if (!this.env.BROWSER) {
      throw new ExternalFetchError(
        'Browser Rendering binding is not configured. Add [browser] binding to wrangler.toml.',
      );
    }

    const normalizedUrl = ensureTrailingSlash(imdbEventUrl);

    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
    let isReusedExistingSession = false;
    try {
      const sessions = await puppeteer.sessions(this.env.BROWSER);
      const freeSession = sessions.find(s => !s.connectionId);
      if (freeSession) {
        try {
          browser = await puppeteer.connect(
            this.env.BROWSER,
            freeSession.sessionId,
          );
          isReusedExistingSession = true;
        } catch (error) {
          console.warn(
            'Failed to reuse existing browser session; launching new:',
            error instanceof Error ? error.message : error,
          );
        }
      }
    } catch (error) {
      console.warn(
        'Failed to enumerate browser sessions; launching new:',
        error instanceof Error ? error.message : error,
      );
    }

    if (!browser) {
      browser = await puppeteer.launch(this.env.BROWSER);
    }

    let html: string;
    try {
      const existingPages = isReusedExistingSession
        ? await browser.pages()
        : [];
      const page =
        existingPages.length > 0 ? existingPages[0] : await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      );
      const gotoWithRetry = async (): Promise<void> => {
        const maxAttempts = 3;
        let lastError: unknown;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await page.goto(normalizedUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 30_000,
            });
            return;
          } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : '';
            const isTransient =
              message.includes('Requesting main frame too early') ||
              message.includes('Target closed') ||
              message.includes('Connection closed');
            if (!isTransient || attempt === maxAttempts) {
              break;
            }

            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          }
        }

        if (
          lastError instanceof Error &&
          lastError.message.includes('Session closed')
        ) {
          throw new ExternalFetchError(
            'Failed to fetch IMDb event page: browser session closed unexpectedly (Cloudflare Browser Rendering may be at concurrent session limit; retry in a moment)',
            {cause: lastError},
          );
        }

        throw new ExternalFetchError(
          `Failed to fetch IMDb event page: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
          {cause: lastError},
        );
      };

      await gotoWithRetry();

      try {
        await page.waitForSelector('script#__NEXT_DATA__', {timeout: 20_000});
      } catch {
        throw new Error(
          'IMDb page did not load expected content (timed out waiting for __NEXT_DATA__)',
        );
      }
      html = await page.content();
    } finally {
      try {
        await (isReusedExistingSession
          ? browser.disconnect()
          : browser.close());
      } catch {
        // Session/browser may already be closed by the platform; ignore
      }
    }
    const marker = '<script id="__NEXT_DATA__" type="application/json">';
    const markerIndex = html.indexOf(marker);

    if (markerIndex === -1) {
      throw new UnprocessableContentError(
        'IMDb event page format is not supported (missing __NEXT_DATA__ payload)',
      );
    }

    const startIndex = markerIndex + marker.length;
    const endIndex = html.indexOf('</script>', startIndex);

    if (endIndex === -1) {
      throw new UnprocessableContentError(
        'IMDb event page format is not supported (unterminated __NEXT_DATA__ payload)',
      );
    }

    let nextData: ImdbNextData;
    try {
      const jsonText = html.slice(startIndex, endIndex);
      nextData = JSON.parse(jsonText) as ImdbNextData;
    } catch (error) {
      console.error('Failed to parse IMDb __NEXT_DATA__ payload:', error);
      throw new Error('Failed to parse IMDb event payload', {cause: error});
    }

    const normalizedTarget = normalizeCategoryName(category.name);
    const targetNames = new Set<string>([normalizedTarget]);
    const commonSynonyms = [
      'best film',
      'best picture',
      'best motion picture',
      'best motion picture of the year',
      'picture of the year',
      'outstanding picture',
      'outstanding production',
      'outstanding motion picture',
    ].map(synonym => normalizeCategoryName(synonym));

    const japaneseBestFilmMarkers = [
      '優秀作品賞',
      '最優秀作品賞',
      '最優秀作品',
      '作品賞',
      '最優秀日本作品賞',
      '最優秀日本映画賞',
    ].map(marker => normalizeCategoryName(marker));

    const englishBestFilmMarkers = commonSynonyms;

    const targetLooksLikeBestFilm =
      japaneseBestFilmMarkers.some(marker => {
        return (
          normalizedTarget.includes(marker) || marker.includes(normalizedTarget)
        );
      }) ||
      englishBestFilmMarkers.some(marker => {
        return (
          normalizedTarget.includes(marker) || marker.includes(normalizedTarget)
        );
      });

    if (targetLooksLikeBestFilm) {
      for (const synonym of commonSynonyms) {
        targetNames.add(synonym);
      }
    } else {
      for (const synonym of commonSynonyms) {
        if (
          normalizedTarget.includes(synonym) ||
          synonym.includes(normalizedTarget)
        ) {
          targetNames.add(synonym);
        }
      }
    }

    for (const group of AWARD_SYNONYM_GROUPS) {
      if (group.some(s => targetNames.has(s) || normalizedTarget === s)) {
        for (const synonym of group) {
          targetNames.add(synonym);
        }
      }
    }

    const {categoryName: imdbCategoryName, nominations: imdbNominations} =
      extractImdbNominations(nextData, targetNames);

    if (imdbNominations.length === 0) {
      throw new UnprocessableContentError(
        `IMDb event page did not provide nominations for category "${category.name}"`,
      );
    }

    const {ensuredMovies, moviesCreated, skipped} =
      await ensureNominationMovies(
        this.database,
        new MovieImportService(this.env),
        imdbNominations,
      );
    const now = Math.floor(Date.now() / 1000);
    const insertedMovieKeys = new Set<string>();
    const nominationRecords: Array<typeof nominations.$inferInsert> = [];

    for (const nomination of imdbNominations) {
      if (!nomination.imdbId) {
        continue;
      }

      const movieUid = ensuredMovies.get(nomination.imdbId);
      if (!movieUid) {
        continue;
      }

      if (insertedMovieKeys.has(movieUid)) {
        continue;
      }

      insertedMovieKeys.add(movieUid);

      const record: typeof nominations.$inferInsert = {
        movieUid,
        ceremonyUid: ceremony.uid,
        categoryUid: category.uid,
        isWinner: nomination.isWinner ? 1 : 0,
        createdAt: now,
      };

      if (nomination.notes && nomination.notes !== '') {
        record.specialMention = nomination.notes;
      }

      nominationRecords.push(record);
    }

    if (nominationRecords.length === 0) {
      throw new UnprocessableContentError(
        'IMDb nominations could not be matched to any movies (missing IMDb IDs)',
      );
    }

    await this.database.transaction(async trx => {
      await trx
        .delete(nominations)
        .where(
          and(
            eq(nominations.ceremonyUid, ceremony.uid),
            eq(nominations.categoryUid, category.uid),
          ),
        );

      await trx.insert(nominations).values(nominationRecords);
    });

    return {
      moviesCreated,
      nominationsInserted: nominationRecords.length,
      skipped,
      imdbEntries: imdbNominations.length,
      categoryName: imdbCategoryName ?? category.name,
    };
  }
}
