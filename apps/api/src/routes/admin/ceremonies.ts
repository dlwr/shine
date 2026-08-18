import {and, eq, getDatabase, not, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {translations} from '@shine/database/schema/translations';
import {Hono} from 'hono';
import {inArray, sql} from 'drizzle-orm';
import {authMiddleware} from '../../auth';
import {sanitizeText, sanitizeUrl} from '../../middleware/sanitizer';
import {AdminService} from '../../services';
import {
  ExternalFetchError,
  NotFoundError,
  UnprocessableContentError,
  ValidationError,
} from '../../services/errors';

export const adminCeremoniesRoutes = new Hono<{Bindings: Environment}>();

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

type ParseCeremonyBodyResult = {data: CeremonyInput} | {error: string};

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
    duplicateYearConditions.push(
      not(eq(awardCeremonies.uid, excludeCeremonyUid)),
    );
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
    currentIndex !== -1 && currentIndex < sortedSiblings.length - 1
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

adminCeremoniesRoutes.get('/ceremonies', authMiddleware, async c => {
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

adminCeremoniesRoutes.get(
  '/ceremonies/:ceremonyUid',
  authMiddleware,
  async c => {
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
  },
);

adminCeremoniesRoutes.post('/ceremonies', authMiddleware, async c => {
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

adminCeremoniesRoutes.put(
  '/ceremonies/:ceremonyUid',
  authMiddleware,
  async c => {
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
  },
);

adminCeremoniesRoutes.post(
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

      if (error instanceof NotFoundError) {
        return c.json({error: error.message}, 404);
      }

      if (error instanceof ValidationError) {
        return c.json({error: error.message}, 400);
      }

      if (error instanceof ExternalFetchError) {
        return c.json({error: error.message}, 502);
      }

      if (error instanceof UnprocessableContentError) {
        return c.json({error: error.message}, 422);
      }

      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

adminCeremoniesRoutes.delete(
  '/ceremonies/:ceremonyUid',
  authMiddleware,
  async c => {
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
  },
);

// Get award organizations, ceremonies, and categories for nomination editing
adminCeremoniesRoutes.get('/awards', authMiddleware, async c => {
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
