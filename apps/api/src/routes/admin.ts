import {and, eq, getDatabase, not, type Environment} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import {Hono} from 'hono';
import {inArray, sql} from 'drizzle-orm';
import {authMiddleware} from '../auth';
import {sanitizeText, sanitizeUrl} from '../middleware/sanitizer';
import {AdminService} from '../services';
import {syncTmdbData, type TmdbSyncResult} from '../services/tmdb-sync';
import {parsePagination} from '../utils/pagination';

type Database = ReturnType<typeof getDatabase>;

const parseInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return;
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return;
};

const parseYear = (value: unknown): number | undefined => {
  const parsed = parseInteger(value);
  if (parsed === undefined || parsed < 1880 || parsed > 9999) {
    return;
  }
  return parsed;
};

const parseCeremonyNumber = (value: unknown): number | undefined => {
  const parsed = parseInteger(value);
  if (parsed === undefined) {
    return;
  }
  return parsed > 0 ? parsed : undefined;
};

const parseUnixTimestamp = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return Math.floor(parsed.getTime() / 1000);
    }
  }

  return;
};

const sanitizeOptionalText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return;
  }

  const sanitized = sanitizeText(value).trim();
  return sanitized.length > 0 ? sanitized : undefined;
};

const parseOptionalUrl = (value: unknown): string | undefined => {
  if (value === undefined) {
    return;
  }

  if (typeof value !== 'string') {
    throw new TypeError('Invalid URL');
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return;
  }

  return sanitizeUrl(trimmed);
};

type CeremonyInput = {
  organizationUid: string;
  year: number;
  ceremonyNumber?: number;
  startDate?: number;
  endDate?: number;
  location?: string;
  description?: string;
  imdbEventUrl?: string;
};

type ParseCeremonyBodyResult =
  | {data: CeremonyInput}
  | {error: string};

const parseCeremonyBody = (body: {
  organizationUid?: unknown;
  year?: unknown;
  ceremonyNumber?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  location?: unknown;
  description?: unknown;
  imdbEventUrl?: unknown;
}): ParseCeremonyBodyResult => {
  const rawOrganizationUid = body.organizationUid;
  if (
    typeof rawOrganizationUid !== 'string' ||
    rawOrganizationUid.trim() === ''
  ) {
    return {error: 'organizationUid is required'};
  }

  const organizationUid = sanitizeText(rawOrganizationUid).trim();
  if (organizationUid === '') {
    return {error: 'organizationUid is required'};
  }

  const year = parseYear(body.year);
  if (year === undefined) {
    return {error: 'year must be a valid number (1880-9999)'};
  }

  const ceremonyNumber = parseCeremonyNumber(body.ceremonyNumber);
  const startDate = parseUnixTimestamp(body.startDate);
  const endDate = parseUnixTimestamp(body.endDate);

  if (startDate !== undefined && endDate !== undefined && endDate < startDate) {
    return {error: 'endDate must be the same as or after startDate'};
  }

  const location = sanitizeOptionalText(body.location);
  const description = sanitizeOptionalText(body.description);

  let imdbEventUrl: string | undefined;
  try {
    imdbEventUrl = parseOptionalUrl(body.imdbEventUrl);
  } catch {
    return {error: 'imdbEventUrl must be a valid http(s) URL'};
  }

  return {
    data: {
      organizationUid,
      year,
      ceremonyNumber,
      startDate,
      endDate,
      location,
      description,
      imdbEventUrl,
    },
  };
};

const findCeremonyConflict = async (
  database: Database,
  input: CeremonyInput,
  excludeCeremonyUid?: string,
): Promise<{error: string; status: 404 | 409} | undefined> => {
  const {organizationUid, year, ceremonyNumber} = input;

  const organizationResult = await database
    .select({uid: awardOrganizations.uid})
    .from(awardOrganizations)
    .where(eq(awardOrganizations.uid, organizationUid))
    .limit(1);

  if (organizationResult.length === 0) {
    return {error: 'Organization not found', status: 404};
  }

  const duplicateYearConditions = [
    eq(awardCeremonies.organizationUid, organizationUid),
    eq(awardCeremonies.year, year),
  ];
  if (excludeCeremonyUid) {
    duplicateYearConditions.push(not(eq(awardCeremonies.uid, excludeCeremonyUid)));
  }

  const duplicateYear = await database
    .select({uid: awardCeremonies.uid})
    .from(awardCeremonies)
    .where(and(...duplicateYearConditions))
    .limit(1);

  if (duplicateYear.length > 0) {
    return {
      error: '同じ主催団体・開催年のセレモニーが既に存在します',
      status: 409,
    };
  }

  if (ceremonyNumber !== undefined) {
    const duplicateNumberConditions = [
      eq(awardCeremonies.organizationUid, organizationUid),
      eq(awardCeremonies.ceremonyNumber, ceremonyNumber),
    ];
    if (excludeCeremonyUid) {
      duplicateNumberConditions.push(
        not(eq(awardCeremonies.uid, excludeCeremonyUid)),
      );
    }

    const duplicateNumber = await database
      .select({uid: awardCeremonies.uid})
      .from(awardCeremonies)
      .where(and(...duplicateNumberConditions))
      .limit(1);

    if (duplicateNumber.length > 0) {
      return {
        error: '同じ主催団体・回数のセレモニーが既に存在します',
        status: 409,
      };
    }
  }

  return undefined;
};

const loadCeremonyDetail = async (database: Database, ceremonyUid: string) => {
  const ceremonyResult = await database
    .select({
      uid: awardCeremonies.uid,
      organizationUid: awardCeremonies.organizationUid,
      organizationName: awardOrganizations.name,
      organizationCountry: awardOrganizations.country,
      year: awardCeremonies.year,
      ceremonyNumber: awardCeremonies.ceremonyNumber,
      startDate: awardCeremonies.startDate,
      endDate: awardCeremonies.endDate,
      location: awardCeremonies.location,
      description: awardCeremonies.description,
      imdbEventUrl: awardCeremonies.imdbEventUrl,
      createdAt: awardCeremonies.createdAt,
      updatedAt: awardCeremonies.updatedAt,
    })
    .from(awardCeremonies)
    .innerJoin(
      awardOrganizations,
      eq(awardCeremonies.organizationUid, awardOrganizations.uid),
    )
    .where(eq(awardCeremonies.uid, ceremonyUid))
    .limit(1);

  if (ceremonyResult.length === 0) {
    return;
  }

  const nominationsResult = await database
    .select({
      uid: nominations.uid,
      movieUid: nominations.movieUid,
      categoryUid: nominations.categoryUid,
      isWinner: nominations.isWinner,
      specialMention: nominations.specialMention,
      movieYear: movies.year,
      movieOriginalLanguage: movies.originalLanguage,
      categoryName: awardCategories.name,
    })
    .from(nominations)
    .innerJoin(
      awardCategories,
      eq(nominations.categoryUid, awardCategories.uid),
    )
    .innerJoin(movies, eq(nominations.movieUid, movies.uid))
    .where(eq(nominations.ceremonyUid, ceremonyUid))
    .orderBy(awardCategories.name, movies.year);

  const movieUids = [
    ...new Set(nominationsResult.map(nomination => nomination.movieUid)),
  ];

  const titlesMap = new Map<string, string>();
  if (movieUids.length > 0) {
    const titleRows = await database
      .select({
        movieUid: translations.resourceUid,
        languageCode: translations.languageCode,
        title: translations.content,
        isDefault: translations.isDefault,
      })
      .from(translations)
      .where(
        and(
          eq(translations.resourceType, 'movie_title'),
          inArray(translations.resourceUid, movieUids),
        ),
      );

    const translationsByMovie = new Map<
      string,
      Array<{
        languageCode: string;
        title: string;
        isDefault: number | null;
      }>
    >();

    for (const row of titleRows) {
      const trimmedTitle = row.title?.trim();
      if (!trimmedTitle) {
        continue;
      }

      const entries = translationsByMovie.get(row.movieUid) ?? [];
      entries.push({
        languageCode: row.languageCode,
        title: trimmedTitle,
        isDefault: row.isDefault ?? 0,
      });
      translationsByMovie.set(row.movieUid, entries);
    }

    const originalLanguageMap = new Map<string, string>();
    for (const nomination of nominationsResult) {
      if (originalLanguageMap.has(nomination.movieUid)) {
        continue;
      }

      const originalLanguage = nomination.movieOriginalLanguage?.trim();
      if (originalLanguage) {
        originalLanguageMap.set(nomination.movieUid, originalLanguage);
      }
    }

    for (const movieUid of movieUids) {
      const entries = translationsByMovie.get(movieUid) ?? [];
      if (entries.length === 0) {
        continue;
      }

      const defaultEntry = entries.find(entry => entry.isDefault === 1);
      const jaEntry = entries.find(entry => entry.languageCode === 'ja');
      const originalLanguage = originalLanguageMap.get(movieUid);
      const originalEntry = originalLanguage
        ? entries.find(entry => entry.languageCode === originalLanguage)
        : undefined;
      const enEntry = entries.find(entry => entry.languageCode === 'en');
      const fallbackEntry = entries[0];

      const selectedEntry =
        defaultEntry ?? jaEntry ?? originalEntry ?? enEntry ?? fallbackEntry;

      if (selectedEntry) {
        titlesMap.set(movieUid, selectedEntry.title);
      }
    }
  }

  const siblingRows = await database
    .select({
      uid: awardCeremonies.uid,
      year: awardCeremonies.year,
      ceremonyNumber: awardCeremonies.ceremonyNumber,
    })
    .from(awardCeremonies)
    .where(
      eq(awardCeremonies.organizationUid, ceremonyResult[0].organizationUid),
    )
    .orderBy(awardCeremonies.year, awardCeremonies.ceremonyNumber);

  // eslint-disable-next-line unicorn/no-array-sort
  const sortedSiblings = [...siblingRows].sort((a, b) => {
    if (a.year !== b.year) {
      return a.year - b.year;
    }

    const aNumber = a.ceremonyNumber ?? Number.MAX_SAFE_INTEGER;
    const bNumber = b.ceremonyNumber ?? Number.MAX_SAFE_INTEGER;

    if (aNumber < bNumber) {
      return -1;
    }

    if (aNumber > bNumber) {
      return 1;
    }

    return 0;
  });

  const currentIndex = sortedSiblings.findIndex(
    sibling => sibling.uid === ceremonyUid,
  );

  const previousCeremony =
    currentIndex > 0 ? sortedSiblings[currentIndex - 1] : undefined;
  const nextCeremony =
    currentIndex >= 0 && currentIndex < sortedSiblings.length - 1
      ? sortedSiblings[currentIndex + 1]
      : undefined;

  return {
    ceremony: ceremonyResult[0],
    nominations: nominationsResult.map(nomination => ({
      uid: nomination.uid,
      movie: {
        uid: nomination.movieUid,
        title: titlesMap.get(nomination.movieUid) ?? '',
        year: nomination.movieYear,
      },
      category: {
        uid: nomination.categoryUid,
        name: nomination.categoryName,
      },
      isWinner: Boolean(nomination.isWinner),
      specialMention: nomination.specialMention,
    })),
    navigation: {
      previous: previousCeremony
        ? {
            uid: previousCeremony.uid,
            year: previousCeremony.year,
            ceremonyNumber: previousCeremony.ceremonyNumber ?? undefined,
          }
        : undefined,
      next: nextCeremony
        ? {
            uid: nextCeremony.uid,
            year: nextCeremony.year,
            ceremonyNumber: nextCeremony.ceremonyNumber ?? undefined,
          }
        : undefined,
    },
  };
};

export const adminRoutes = new Hono<{Bindings: Environment}>();

// Get movie details for admin with all translations, posters, and nominations
adminRoutes.get('/movies/:id', authMiddleware, async c => {
  try {
    const adminService = new AdminService(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const movieDetails = await adminService.getMovieForAdmin(movieId);

    return c.json(movieDetails);
  } catch (error) {
    console.error('Error fetching movie details for admin:', error);

    if (error instanceof Error && error.message === 'Movie not found') {
      return c.json({error: 'Movie not found'}, 404);
    }

    return c.json({error: 'Internal server error'}, 500);
  }
});

adminRoutes.get('/movies/:id/external-id-search', authMiddleware, async c => {
  try {
    const adminService = new AdminService(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const rawQuery = c.req.query('query');
    const rawLanguage = c.req.query('language');
    const rawYear = c.req.query('year');
    const rawLimit = c.req.query('limit');

    const query = rawQuery ? sanitizeText(rawQuery) : undefined;

    const language = (() => {
      if (!rawLanguage) {
        return;
      }

      const sanitized = sanitizeText(rawLanguage);

      if (/^ja/i.test(sanitized)) {
        return 'ja-JP';
      }

      if (/^en/i.test(sanitized)) {
        return 'en-US';
      }

      return;
    })();

    const year = rawYear ? Number.parseInt(rawYear, 10) : undefined;
    const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;

    if (year !== undefined && Number.isNaN(year)) {
      return c.json({error: 'Invalid year parameter'}, 400);
    }

    if (limit !== undefined && (Number.isNaN(limit) || limit < 1)) {
      return c.json({error: 'Invalid limit parameter'}, 400);
    }

    const result = await adminService.searchExternalMovieIds(movieId, {
      query,
      language,
      year,
      limit,
    });

    return c.json(result);
  } catch (error) {
    console.error('Error searching external IDs:', error);

    if (error instanceof Error) {
      if (error.message === 'Movie not found') {
        return c.json({error: 'Movie not found'}, 404);
      }

      if (error.message === 'Unable to determine search query') {
        return c.json({error: 'Search query is required'}, 400);
      }

      if (error.message === 'TMDb API key not configured') {
        return c.json({error: 'TMDb API key is not configured'}, 503);
      }
    }

    return c.json({error: 'Internal server error'}, 500);
  }
});

// Get all movies for admin
adminRoutes.get('/movies', authMiddleware, async c => {
  try {
    const adminService = new AdminService(c.env);
    const {page, limit} = parsePagination(c, {defaultLimit: 50});
    const rawSearch = c.req.query('search');
    const search = rawSearch ? sanitizeText(rawSearch) : undefined;

    const result = await adminService.getMovies({page, limit, search});

    return c.json({
      movies: result.movies.map(movie => ({
        uid: movie.uid,
        year: movie.year,
        originalLanguage: movie.originalLanguage,
        imdbId: movie.imdbId,
        title: movie.title || 'Untitled',
        posterUrl: movie.posterUrl,
        imdbUrl: movie.imdbId
          ? `https://www.imdb.com/title/${movie.imdbId}/`
          : undefined,
      })),
      pagination: {
        page: result.pagination.currentPage,
        limit,
        totalCount: result.pagination.totalCount,
        totalPages: result.pagination.totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching movies list:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

adminRoutes.post('/movies', authMiddleware, async c => {
  try {
    const adminService = new AdminService(c.env);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({error: 'Invalid request body'}, 400);
    }

    const {imdbId, refreshData = true} = (body ?? {}) as {
      imdbId?: string;
      refreshData?: boolean;
    };

    if (!imdbId || typeof imdbId !== 'string') {
      return c.json({error: 'IMDb ID is required'}, 400);
    }

    const sanitizedImdbId = sanitizeText(imdbId);

    const result = await adminService.createMovieFromImdbId(sanitizedImdbId, {
      fetchTMDBData: refreshData !== false,
    });

    return c.json(
      {
        success: true,
        movie: {
          uid: result.movie.uid,
          imdbId: result.movie.imdbId ?? undefined,
          tmdbId: result.movie.tmdbId ?? undefined,
          year: result.movie.year ?? undefined,
          originalLanguage: result.movie.originalLanguage,
        },
        imports: {
          translationsAdded: result.translationsAdded,
          postersAdded: result.postersAdded,
        },
      },
      201,
    );
  } catch (error) {
    console.error('Error creating movie:', error);

    if (error instanceof Error) {
      if (error.message === 'IMDb ID is required') {
        return c.json({error: 'IMDb ID is required'}, 400);
      }

      if (error.message === 'Invalid IMDb ID format') {
        return c.json({error: "IMDB ID must be in format 'tt1234567'"}, 400);
      }

      if (error.message === 'IMDb ID already exists for another movie') {
        return c.json({error: 'IMDB ID is already used by another movie'}, 409);
      }

      if (error.message === 'TMDB data not found for IMDb ID') {
        return c.json(
          {error: 'Could not find TMDB data for that IMDb ID'},
          404,
        );
      }

      if (error.message === 'TMDB ID already exists for another movie') {
        return c.json({error: 'TMDB ID is already used by another movie'}, 409);
      }
    }

    return c.json({error: 'Internal server error'}, 500);
  }
});

// Delete movie
adminRoutes.delete('/movies/:id', authMiddleware, async c => {
  try {
    const adminService = new AdminService(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    await adminService.deleteMovie(movieId);

    return c.json({success: true});
  } catch (error) {
    console.error('Error deleting movie:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Flag article as spam
adminRoutes.post('/article-links/:id/spam', authMiddleware, async c => {
  try {
    const adminService = new AdminService(c.env);
    const articleId = c.req.param('id');
    if (!articleId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    await adminService.flagArticleAsSpam(articleId);

    return c.json({success: true});
  } catch (error) {
    console.error('Error flagging article as spam:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Delete article link
adminRoutes.delete('/article-links/:id', authMiddleware, async c => {
  try {
    const adminService = new AdminService(c.env);
    const articleId = c.req.param('id');
    if (!articleId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    await adminService.deleteArticleLink(articleId);

    return c.json({success: true});
  } catch (error) {
    console.error('Error deleting article link:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Add poster URL
adminRoutes.post('/movies/:id/posters', authMiddleware, async c => {
  try {
    const adminService = new AdminService(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const {
      url,
      width,
      height,
      languageCode,
      isPrimary = false,
    } = await c.req.json();

    // Validate inputs
    if (!url) {
      return c.json({error: 'URL is required'}, 400);
    }

    // Basic URL validation
    let normalizedUrl: string;
    try {
      normalizedUrl = new URL(url).toString();
    } catch {
      return c.json({error: 'Invalid URL format'}, 400);
    }

    const newPoster = await adminService.addPoster(movieId, {
      url: normalizedUrl,
      width,
      height,
      language: languageCode,
      source: 'manual',
      isPrimary,
    });

    return c.json(newPoster);
  } catch (error) {
    console.error('Error adding poster:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Delete poster URL
adminRoutes.delete(
  '/movies/:movieId/posters/:posterId',
  authMiddleware,
  async c => {
    try {
      const adminService = new AdminService(c.env);
      const movieId = c.req.param('movieId');
      const posterId = c.req.param('posterId');
      if (!movieId || !posterId) {
        return c.json({error: 'Missing movieId or posterId parameter'}, 400);
      }

      await adminService.deletePoster(movieId, posterId);

      return c.json({success: true});
    } catch (error) {
      console.error('Error deleting poster:', error);
      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

// Update movie basic info (year, original language)
adminRoutes.put('/movies/:id', authMiddleware, async c => {
  try {
    const database = getDatabase(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const {year, originalLanguage, mediaType} = await c.req.json();

    // Check if movie exists
    const movieExists = await database
      .select({uid: movies.uid})
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      return c.json({error: 'Movie not found'}, 404);
    }

    const updateData: Partial<typeof movies.$inferInsert> = {
      updatedAt: Math.floor(Date.now() / 1000),
    };

    // Validate year if provided
    if (year !== undefined) {
      if (
        typeof year !== 'number' ||
        !Number.isInteger(year) ||
        year < 1888 ||
        year > 2100
      ) {
        return c.json(
          {error: 'Year must be a valid integer between 1888 and 2100'},
          400,
        );
      }

      updateData.year = year;
    }

    // Validate original language if provided
    if (originalLanguage !== undefined) {
      if (originalLanguage && typeof originalLanguage !== 'string') {
        return c.json({error: 'Original language must be a string'}, 400);
      }

      if (originalLanguage && originalLanguage.length !== 2) {
        return c.json(
          {error: 'Original language must be a 2-letter ISO 639-1 code'},
          400,
        );
      }

      updateData.originalLanguage = originalLanguage || 'en';
    }

    // Validate mediaType if provided
    if (mediaType !== undefined) {
      if (mediaType !== 'movie' && mediaType !== 'tv') {
        return c.json({error: "mediaType must be 'movie' or 'tv'"}, 400);
      }

      updateData.mediaType = mediaType;
    }

    // Update movie
    await database
      .update(movies)
      .set(updateData)
      .where(eq(movies.uid, movieId));

    return c.json({success: true});
  } catch (error) {
    console.error('Error updating movie:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Update movie IMDB ID
adminRoutes.put('/movies/:id/imdb-id', authMiddleware, async c => {
  try {
    const adminService = new AdminService(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const {imdbId, refreshData = false} = await c.req.json();

    const refreshResults = await adminService.updateIMDbId(movieId, {
      imdbId,
      fetchTMDBData: refreshData,
    });

    return c.json({
      success: true,
      refreshResults: refreshData ? refreshResults : undefined,
    });
  } catch (error) {
    console.error('Error updating IMDB ID:', error);

    if (error instanceof Error) {
      if (error.message === 'Movie not found') {
        return c.json({error: 'Movie not found'}, 404);
      }

      if (error.message === 'Invalid IMDb ID format') {
        return c.json({error: "IMDB ID must be in format 'tt1234567'"}, 400);
      }

      if (error.message === 'IMDb ID already exists for another movie') {
        return c.json({error: 'IMDB ID is already used by another movie'}, 409);
      }
    }

    return c.json({error: 'Internal server error'}, 500);
  }
});

// Update movie TMDb ID
adminRoutes.put('/movies/:id/tmdb-id', authMiddleware, async c => {
  try {
    const database = getDatabase(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const {
      tmdbId,
      refreshData = false,
      mediaType: bodyMediaType,
    } = await c.req.json();

    // Validate TMDb ID (must be a positive integer)
    if (
      tmdbId !== undefined &&
      (typeof tmdbId !== 'number' || !Number.isInteger(tmdbId) || tmdbId <= 0)
    ) {
      return c.json({error: 'TMDb ID must be a positive integer'}, 400);
    }

    // Check if movie exists
    const movieExists = await database
      .select({
        uid: movies.uid,
        imdbId: movies.imdbId,
        mediaType: movies.mediaType,
      })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      return c.json({error: 'Movie not found'}, 404);
    }

    // Check if TMDb ID is already used by another movie
    if (typeof tmdbId === 'number') {
      const existingMovie = await database
        .select({uid: movies.uid})
        .from(movies)
        .where(and(eq(movies.tmdbId, tmdbId), not(eq(movies.uid, movieId))))
        .limit(1);

      if (existingMovie.length > 0) {
        return c.json({error: 'TMDb ID is already used by another movie'}, 409);
      }
    }

    // Determine mediaType
    const updateMediaType: 'movie' | 'tv' =
      bodyMediaType === 'tv'
        ? 'tv'
        : (movieExists[0].mediaType as 'movie' | 'tv') || 'movie';

    // Update TMDb ID and mediaType
    await database
      .update(movies)
      .set({
        tmdbId: typeof tmdbId === 'number' ? tmdbId : undefined,
        mediaType: updateMediaType,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(movies.uid, movieId));

    // If refreshData is true and tmdbId is provided, fetch additional data from TMDb
    let refreshResults: TmdbSyncResult = {
      postersAdded: 0,
      translationsAdded: 0,
    };

    if (refreshData && typeof tmdbId === 'number' && c.env.TMDB_API_KEY) {
      try {
        refreshResults = await syncTmdbData(
          database,
          movieId,
          tmdbId,
          updateMediaType,
          c.env,
        );
      } catch (refreshError) {
        console.warn('Error during data refresh:', refreshError);
        // Continue without failing the main operation
      }
    }

    return c.json({
      success: true,
      refreshResults: refreshData ? refreshResults : undefined,
    });
  } catch (error) {
    console.error('Error updating TMDb ID:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

adminRoutes.get('/ceremonies', authMiddleware, async c => {
  try {
    const database = getDatabase(c.env);

    const rawCeremonies = await database
      .select({
        uid: awardCeremonies.uid,
        organizationUid: awardCeremonies.organizationUid,
        organizationName: awardOrganizations.name,
        organizationCountry: awardOrganizations.country,
        year: awardCeremonies.year,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        startDate: awardCeremonies.startDate,
        endDate: awardCeremonies.endDate,
        location: awardCeremonies.location,
        description: awardCeremonies.description,
        imdbEventUrl: awardCeremonies.imdbEventUrl,
        createdAt: awardCeremonies.createdAt,
        updatedAt: awardCeremonies.updatedAt,
      })
      .from(awardCeremonies)
      .innerJoin(
        awardOrganizations,
        eq(awardCeremonies.organizationUid, awardOrganizations.uid),
      )
      .orderBy(awardOrganizations.name, awardCeremonies.year);

    const nominationCounts = await database
      .select({
        ceremonyUid: nominations.ceremonyUid,
        movieCount: sql<number>`COUNT(DISTINCT ${nominations.movieUid})`,
      })
      .from(nominations)
      .groupBy(nominations.ceremonyUid);

    const countsMap = new Map<string, number>();
    for (const item of nominationCounts) {
      countsMap.set(item.ceremonyUid, item.movieCount ?? 0);
    }

    const ceremonies = rawCeremonies.map(ceremony => ({
      ...ceremony,
      movieCount: countsMap.get(ceremony.uid) ?? 0,
    }));

    return c.json({ceremonies});
  } catch (error) {
    console.error('Error fetching ceremonies list:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

adminRoutes.get('/ceremonies/:ceremonyUid', authMiddleware, async c => {
  try {
    const ceremonyUid = c.req.param('ceremonyUid');

    if (!ceremonyUid) {
      return c.json({error: 'Ceremony UID is required'}, 400);
    }

    const database = getDatabase(c.env);
    const detail = await loadCeremonyDetail(database, ceremonyUid);

    if (!detail) {
      return c.json({error: 'Ceremony not found'}, 404);
    }

    return c.json(detail);
  } catch (error) {
    console.error('Error fetching ceremony detail:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

adminRoutes.post('/ceremonies', authMiddleware, async c => {
  try {
    const body = await c.req.json();

    const parsed = parseCeremonyBody(body);
    if ('error' in parsed) {
      return c.json({error: parsed.error}, 400);
    }

    const database = getDatabase(c.env);

    const conflict = await findCeremonyConflict(database, parsed.data);
    if (conflict) {
      return c.json({error: conflict.error}, conflict.status);
    }

    const [inserted] = await database
      .insert(awardCeremonies)
      .values(parsed.data)
      .returning({uid: awardCeremonies.uid});

    const detail = await loadCeremonyDetail(database, inserted.uid);
    return c.json(detail, 201);
  } catch (error) {
    console.error('Error creating ceremony:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

adminRoutes.put('/ceremonies/:ceremonyUid', authMiddleware, async c => {
  try {
    const ceremonyUid = c.req.param('ceremonyUid');

    if (!ceremonyUid) {
      return c.json({error: 'Ceremony UID is required'}, 400);
    }

    const body = await c.req.json();

    const parsed = parseCeremonyBody(body);
    if ('error' in parsed) {
      return c.json({error: parsed.error}, 400);
    }

    const database = getDatabase(c.env);

    const ceremonyExists = await database
      .select({uid: awardCeremonies.uid})
      .from(awardCeremonies)
      .where(eq(awardCeremonies.uid, ceremonyUid))
      .limit(1);

    if (ceremonyExists.length === 0) {
      return c.json({error: 'Ceremony not found'}, 404);
    }

    const conflict = await findCeremonyConflict(
      database,
      parsed.data,
      ceremonyUid,
    );
    if (conflict) {
      return c.json({error: conflict.error}, conflict.status);
    }

    const now = Math.floor(Date.now() / 1000);

    await database
      .update(awardCeremonies)
      .set({
        ...parsed.data,
        updatedAt: now,
      })
      .where(eq(awardCeremonies.uid, ceremonyUid));

    const detail = await loadCeremonyDetail(database, ceremonyUid);
    return c.json(detail);
  } catch (error) {
    console.error('Error updating ceremony:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

adminRoutes.post(
  '/ceremonies/:ceremonyUid/sync-imdb',
  authMiddleware,
  async c => {
    try {
      const ceremonyUid = c.req.param('ceremonyUid');

      if (!ceremonyUid) {
        return c.json({error: 'Ceremony UID is required'}, 400);
      }

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({error: 'Invalid request body'}, 400);
      }

      const {categoryUid} = (body ?? {}) as {categoryUid?: unknown};

      if (typeof categoryUid !== 'string' || categoryUid.trim() === '') {
        return c.json({error: 'Category UID is required'}, 400);
      }

      const sanitizedCategoryUid = sanitizeText(categoryUid).trim();
      if (sanitizedCategoryUid === '') {
        return c.json({error: 'Category UID is required'}, 400);
      }

      const adminService = new AdminService(c.env);
      const result = await adminService.syncCeremonyNominationsFromImdb(
        ceremonyUid,
        {categoryUid: sanitizedCategoryUid},
      );

      const database = getDatabase(c.env);
      const detail = await loadCeremonyDetail(database, ceremonyUid);

      if (!detail) {
        return c.json({error: 'Ceremony not found'}, 404);
      }

      return c.json({
        success: true,
        ceremony: detail,
        stats: result,
      });
    } catch (error) {
      console.error('Error syncing ceremony from IMDb:', error);

      if (error instanceof Error) {
        if (
          error.message === 'Ceremony not found' ||
          error.message === 'Category not found'
        ) {
          return c.json({error: error.message}, 404);
        }

        if (
          error.message ===
            'Ceremony does not have an IMDb event URL configured' ||
          error.message ===
            'Category does not belong to the ceremony organization' ||
          error.message === 'Category UID is required'
        ) {
          return c.json({error: error.message}, 400);
        }

        if (error.message.startsWith('Failed to fetch IMDb event page')) {
          return c.json({error: error.message}, 502);
        }

        if (
          error.message.startsWith('IMDb event page') ||
          error.message ===
            'IMDb nominations could not be matched to any movies (missing IMDb IDs)'
        ) {
          return c.json({error: error.message}, 422);
        }

        if (error.message.includes('Browser Rendering')) {
          return c.json({error: error.message}, 502);
        }
      }

      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

adminRoutes.delete('/ceremonies/:ceremonyUid', authMiddleware, async c => {
  try {
    const ceremonyUid = c.req.param('ceremonyUid');

    if (!ceremonyUid) {
      return c.json({error: 'Ceremony UID is required'}, 400);
    }

    const database = getDatabase(c.env);

    const ceremonyExists = await database
      .select({uid: awardCeremonies.uid})
      .from(awardCeremonies)
      .where(eq(awardCeremonies.uid, ceremonyUid))
      .limit(1);

    if (ceremonyExists.length === 0) {
      return c.json({error: 'Ceremony not found'}, 404);
    }

    await database
      .delete(nominations)
      .where(eq(nominations.ceremonyUid, ceremonyUid));

    await database
      .delete(awardCeremonies)
      .where(eq(awardCeremonies.uid, ceremonyUid));

    return c.json({success: true});
  } catch (error) {
    console.error('Error deleting ceremony:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Get award organizations, ceremonies, and categories for nomination editing
adminRoutes.get('/awards', authMiddleware, async c => {
  try {
    const database = getDatabase(c.env);

    // Get award organizations
    const organizations = await database
      .select({
        uid: awardOrganizations.uid,
        name: awardOrganizations.name,
        country: awardOrganizations.country,
      })
      .from(awardOrganizations)
      .orderBy(awardOrganizations.name);

    // Get award ceremonies
    const ceremonies = await database
      .select({
        uid: awardCeremonies.uid,
        organizationUid: awardCeremonies.organizationUid,
        year: awardCeremonies.year,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        organizationName: awardOrganizations.name,
        imdbEventUrl: awardCeremonies.imdbEventUrl,
      })
      .from(awardCeremonies)
      .innerJoin(
        awardOrganizations,
        eq(awardCeremonies.organizationUid, awardOrganizations.uid),
      )
      .orderBy(awardOrganizations.name, awardCeremonies.year);

    // Get award categories
    const categories = await database
      .select({
        uid: awardCategories.uid,
        organizationUid: awardCategories.organizationUid,
        name: awardCategories.name,
        organizationName: awardOrganizations.name,
      })
      .from(awardCategories)
      .innerJoin(
        awardOrganizations,
        eq(awardCategories.organizationUid, awardOrganizations.uid),
      )
      .orderBy(awardOrganizations.name, awardCategories.name);

    return c.json({
      organizations,
      ceremonies,
      categories,
    });
  } catch (error) {
    console.error('Error fetching awards data:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Add nomination
adminRoutes.post('/movies/:movieId/nominations', authMiddleware, async c => {
  try {
    const database = getDatabase(c.env);
    const movieId = c.req.param('movieId');
    if (!movieId) {
      return c.json({error: 'Missing movieId parameter'}, 400);
    }

    const {
      ceremonyUid,
      categoryUid,
      isWinner = false,
      specialMention,
    } = await c.req.json();

    // Validate required fields
    if (!ceremonyUid || !categoryUid) {
      return c.json({error: 'Ceremony and category are required'}, 400);
    }

    // Check if movie exists
    const movieExists = await database
      .select({uid: movies.uid})
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      return c.json({error: 'Movie not found'}, 404);
    }

    // Check if ceremony exists
    const ceremonyExists = await database
      .select({uid: awardCeremonies.uid})
      .from(awardCeremonies)
      .where(eq(awardCeremonies.uid, ceremonyUid))
      .limit(1);

    if (ceremonyExists.length === 0) {
      return c.json({error: 'Ceremony not found'}, 404);
    }

    // Check if category exists
    const categoryExists = await database
      .select({uid: awardCategories.uid})
      .from(awardCategories)
      .where(eq(awardCategories.uid, categoryUid))
      .limit(1);

    if (categoryExists.length === 0) {
      return c.json({error: 'Category not found'}, 404);
    }

    // Check if nomination already exists
    const existingNomination = await database
      .select({uid: nominations.uid})
      .from(nominations)
      .where(
        and(
          eq(nominations.movieUid, movieId),
          eq(nominations.ceremonyUid, ceremonyUid),
          eq(nominations.categoryUid, categoryUid),
        ),
      )
      .limit(1);

    if (existingNomination.length > 0) {
      return c.json(
        {
          error:
            'Nomination already exists for this movie, ceremony, and category',
        },
        409,
      );
    }

    // Add nomination
    const newNomination = await database
      .insert(nominations)
      .values({
        movieUid: movieId,
        ceremonyUid,
        categoryUid,
        isWinner: isWinner ? 1 : 0,
        specialMention: specialMention || undefined,
      })
      .returning();

    return c.json(newNomination[0]);
  } catch (error) {
    console.error('Error adding nomination:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Update nomination
adminRoutes.put('/nominations/:nominationId', authMiddleware, async c => {
  try {
    const database = getDatabase(c.env);
    const nominationId = c.req.param('nominationId');
    if (!nominationId) {
      return c.json({error: 'Missing nominationId parameter'}, 400);
    }

    const {isWinner, specialMention} = await c.req.json();

    // Check if nomination exists
    const nomination = await database
      .select({uid: nominations.uid})
      .from(nominations)
      .where(eq(nominations.uid, nominationId))
      .limit(1);

    if (nomination.length === 0) {
      return c.json({error: 'Nomination not found'}, 404);
    }

    // Update nomination
    await database
      .update(nominations)
      .set({
        isWinner: isWinner ? 1 : 0,
        specialMention: specialMention || undefined,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(nominations.uid, nominationId));

    return c.json({success: true});
  } catch (error) {
    console.error('Error updating nomination:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Delete nomination
adminRoutes.delete('/nominations/:nominationId', authMiddleware, async c => {
  try {
    const database = getDatabase(c.env);
    const nominationId = c.req.param('nominationId');
    if (!nominationId) {
      return c.json({error: 'Missing nominationId parameter'}, 400);
    }

    // Check if nomination exists
    const nomination = await database
      .select({uid: nominations.uid})
      .from(nominations)
      .where(eq(nominations.uid, nominationId))
      .limit(1);

    if (nomination.length === 0) {
      return c.json({error: 'Nomination not found'}, 404);
    }

    // Delete nomination
    await database.delete(nominations).where(eq(nominations.uid, nominationId));

    return c.json({success: true});
  } catch (error) {
    console.error('Error deleting nomination:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Auto-fetch TMDb data using IMDb ID
adminRoutes.post('/movies/:id/auto-fetch-tmdb', authMiddleware, async c => {
  try {
    const database = getDatabase(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    // Check if movie exists and has IMDb ID
    const movie = await database
      .select({
        uid: movies.uid,
        imdbId: movies.imdbId,
        tmdbId: movies.tmdbId,
        originalLanguage: movies.originalLanguage,
        mediaType: movies.mediaType,
      })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movie.length === 0) {
      return c.json({error: 'Movie not found'}, 404);
    }

    const {imdbId, tmdbId} = movie[0];
    if (!imdbId) {
      return c.json({error: 'Movie does not have an IMDb ID'}, 400);
    }

    const tmdbApiKey = c.env.TMDB_API_KEY;
    if (!tmdbApiKey || tmdbApiKey === '') {
      return c.json({error: 'TMDb API key not configured'}, 500);
    }

    const fetchResults = {
      tmdbIdSet: false,
      postersAdded: 0,
      translationsAdded: 0,
    };

    try {
      // Import TMDb utilities
      const {findTMDBByImdbId} =
        await import('@shine/scrapers/common/tmdb-utilities');

      let movieTmdbId: number | undefined = tmdbId ?? undefined;
      let detectedMediaType: 'movie' | 'tv' =
        (movie[0].mediaType as 'movie' | 'tv') || 'movie';

      // Find TMDb ID if not already set
      if (!movieTmdbId) {
        const findResult = await findTMDBByImdbId(imdbId, tmdbApiKey);

        if (!findResult) {
          return c.json({error: 'TMDb映画が見つかりませんでした'}, 404);
        }

        movieTmdbId = findResult.tmdbId;
        detectedMediaType = findResult.mediaType;

        // Check if TMDb ID is already used by another movie
        const existingMovie = await database
          .select({uid: movies.uid})
          .from(movies)
          .where(
            and(eq(movies.tmdbId, movieTmdbId), not(eq(movies.uid, movieId))),
          )
          .limit(1);

        if (existingMovie.length > 0) {
          return c.json(
            {error: 'このTMDb IDは既に他の映画で使用されています'},
            409,
          );
        }

        // Save TMDb ID and mediaType to database
        try {
          await database
            .update(movies)
            .set({
              tmdbId: movieTmdbId,
              mediaType: detectedMediaType,
              updatedAt: Math.floor(Date.now() / 1000),
            })
            .where(eq(movies.uid, movieId));
        } catch (databaseError) {
          console.error('Database update error:', {
            error: databaseError,
            movieId,
            tmdbId: movieTmdbId,
            updatedAt: Math.floor(Date.now() / 1000),
          });
          throw databaseError;
        }

        fetchResults.tmdbIdSet = true;
      }

      const syncResult = await syncTmdbData(
        database,
        movieId,
        movieTmdbId,
        detectedMediaType,
        c.env,
      );
      fetchResults.postersAdded = syncResult.postersAdded;
      fetchResults.translationsAdded = syncResult.translationsAdded;

      return c.json({
        success: true,
        fetchResults,
      });
    } catch (fetchError) {
      console.error('Error during TMDb auto-fetch:', fetchError);
      const errorMessage =
        fetchError instanceof Error ? fetchError.message : 'Unknown error';
      return c.json(
        {
          error: 'TMDbデータの自動取得に失敗しました',
          details: errorMessage,
        },
        500,
      );
    }
  } catch (error) {
    console.error('Error auto-fetching TMDb data:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Refresh TMDb data (posters and translations)
adminRoutes.post('/movies/:id/refresh-tmdb', authMiddleware, async c => {
  try {
    const database = getDatabase(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    // Check if movie exists and has TMDb ID
    const movie = await database
      .select({
        uid: movies.uid,
        tmdbId: movies.tmdbId,
        mediaType: movies.mediaType,
      })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movie.length === 0) {
      return c.json({error: 'Movie not found'}, 404);
    }

    const {tmdbId} = movie[0];
    const refreshMediaType = (movie[0].mediaType as 'movie' | 'tv') || 'movie';
    if (!tmdbId) {
      return c.json({error: 'Movie does not have a TMDb ID'}, 400);
    }

    if (!c.env.TMDB_API_KEY) {
      return c.json({error: 'TMDb API key not configured'}, 500);
    }

    try {
      const refreshResults = await syncTmdbData(
        database,
        movieId,
        tmdbId,
        refreshMediaType,
        c.env,
      );

      return c.json({
        success: true,
        refreshResults,
      });
    } catch (refreshError) {
      console.error('Error during TMDb data refresh:', refreshError);
      return c.json({error: 'Failed to refresh TMDb data'}, 500);
    }
  } catch (error) {
    console.error('Error refreshing TMDb data:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Merge movies - combines source movie data into target movie and deletes source
adminRoutes.post(
  '/movies/:sourceId/merge/:targetId',
  authMiddleware,
  async c => {
    try {
      const database = getDatabase(c.env);
      const sourceId = c.req.param('sourceId');
      const targetId = c.req.param('targetId');
      if (!sourceId || !targetId) {
        return c.json({error: 'Missing sourceId or targetId parameter'}, 400);
      }

      if (sourceId === targetId) {
        return c.json(
          {error: 'Source and target cannot be the same movie'},
          400,
        );
      }

      // Verify both movies exist
      const [sourceMovie] = await database
        .select()
        .from(movies)
        .where(eq(movies.uid, sourceId))
        .limit(1);

      const [targetMovie] = await database
        .select()
        .from(movies)
        .where(eq(movies.uid, targetId))
        .limit(1);

      if (!sourceMovie) {
        return c.json({error: 'Source movie not found'}, 404);
      }

      if (!targetMovie) {
        return c.json({error: 'Target movie not found'}, 404);
      }

      // Merge operations in transaction
      await database.transaction(async tx => {
        // Update article_links
        await tx
          .update(articleLinks)
          .set({movieUid: targetId})
          .where(eq(articleLinks.movieUid, sourceId));

        // Update movie_selections
        await tx
          .update(movieSelections)
          .set({movieId: targetId})
          .where(eq(movieSelections.movieId, sourceId));

        // Update nominations
        await tx
          .update(nominations)
          .set({movieUid: targetId})
          .where(eq(nominations.movieUid, sourceId));

        // Update reference_urls
        await tx
          .update(referenceUrls)
          .set({movieUid: targetId})
          .where(eq(referenceUrls.movieUid, sourceId));

        // Merge translations (avoid duplicates)
        const sourceTranslations = await tx
          .select()
          .from(translations)
          .where(
            and(
              eq(translations.resourceType, 'movie_title'),
              eq(translations.resourceUid, sourceId),
            ),
          );

        for (const translation of sourceTranslations) {
          await tx
            .insert(translations)
            .values({
              resourceType: 'movie_title',
              resourceUid: targetId,
              languageCode: translation.languageCode,
              content: translation.content,
              isDefault: translation.isDefault,
            })
            .onConflictDoNothing({
              target: [
                translations.resourceType,
                translations.resourceUid,
                translations.languageCode,
              ],
            });
        }

        // Delete source translations
        await tx
          .delete(translations)
          .where(
            and(
              eq(translations.resourceType, 'movie_title'),
              eq(translations.resourceUid, sourceId),
            ),
          );

        // Merge poster URLs (avoid duplicates by URL)
        const sourcePosters = await tx
          .select()
          .from(posterUrls)
          .where(eq(posterUrls.movieUid, sourceId));

        // Get existing target posters to check for URL duplicates
        const existingTargetPosters = await tx
          .select({url: posterUrls.url})
          .from(posterUrls)
          .where(eq(posterUrls.movieUid, targetId));

        const existingUrls = new Set(
          existingTargetPosters.map((p: {url: string}) => p.url),
        );

        for (const poster of sourcePosters) {
          // Only insert if URL doesn't already exist for target movie
          if (!existingUrls.has(poster.url)) {
            await tx.insert(posterUrls).values({
              movieUid: targetId,
              url: poster.url,
              width: poster.width,
              height: poster.height,
              languageCode: poster.languageCode,
              countryCode: poster.countryCode,
              sourceType: poster.sourceType,
              isPrimary: poster.isPrimary,
            });
          }
        }

        // Delete source posters
        await tx.delete(posterUrls).where(eq(posterUrls.movieUid, sourceId));

        // Update target movie with merged metadata (preserve existing if target has data)

        const updateData: Partial<typeof movies.$inferInsert> = {
          updatedAt: Math.floor(Date.now() / 1000),
        };

        if (!targetMovie.imdbId && sourceMovie.imdbId) {
          // Check if IMDb ID is already used by another movie
          const existingImdbMovie = await tx
            .select({uid: movies.uid})
            .from(movies)
            .where(
              and(
                eq(movies.imdbId, sourceMovie.imdbId),
                not(eq(movies.uid, targetId)),
              ),
            )
            .limit(1);

          if (existingImdbMovie.length === 0) {
            updateData.imdbId = sourceMovie.imdbId;
          }
        }

        if (!targetMovie.tmdbId && sourceMovie.tmdbId) {
          // Check if TMDb ID is already used by another movie
          const existingTmdbMovie = await tx
            .select({uid: movies.uid})
            .from(movies)
            .where(
              and(
                eq(movies.tmdbId, sourceMovie.tmdbId),
                not(eq(movies.uid, targetId)),
              ),
            )
            .limit(1);

          if (existingTmdbMovie.length === 0) {
            updateData.tmdbId = sourceMovie.tmdbId;
          }
        }

        if (Object.keys(updateData).length > 1) {
          await tx
            .update(movies)
            .set(updateData)
            .where(eq(movies.uid, targetId));
        }

        // Finally, delete the source movie
        await tx.delete(movies).where(eq(movies.uid, sourceId));
      });

      return c.json({
        success: true,
        message: `Movie ${sourceId} successfully merged into ${targetId}`,
      });
    } catch (error) {
      console.error('Error merging movies:', error);
      return c.json(
        {
          error: 'Internal server error',
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },
);
