import {and, eq, inArray, not, sql} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {translations} from '@shine/database/schema/translations';
import {sanitizeText, sanitizeUrl} from '../middleware/sanitizer';
import {BaseService} from './base-service';
import {ConflictError, NotFoundError, ValidationError} from './errors';

export type CeremonyBody = {
  organizationUid?: unknown;
  year?: unknown;
  ceremonyNumber?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  location?: unknown;
  description?: unknown;
  imdbEventUrl?: unknown;
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

const parseInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return;
    }

    const parsed = Number(trimmed);
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

export function parseCeremonyBody(body: CeremonyBody): CeremonyInput {
  const rawOrganizationUid = body.organizationUid;
  if (
    typeof rawOrganizationUid !== 'string' ||
    rawOrganizationUid.trim() === ''
  ) {
    throw new ValidationError('organizationUid is required');
  }

  const organizationUid = sanitizeText(rawOrganizationUid).trim();
  if (organizationUid === '') {
    throw new ValidationError('organizationUid is required');
  }

  const year = parseYear(body.year);
  if (year === undefined) {
    throw new ValidationError('year must be a valid number (1880-9999)');
  }

  const ceremonyNumber = parseCeremonyNumber(body.ceremonyNumber);
  const startDate = parseUnixTimestamp(body.startDate);
  const endDate = parseUnixTimestamp(body.endDate);

  if (startDate !== undefined && endDate !== undefined && endDate < startDate) {
    throw new ValidationError('endDate must be the same as or after startDate');
  }

  const location = sanitizeOptionalText(body.location);
  const description = sanitizeOptionalText(body.description);

  let imdbEventUrl: string | undefined;
  try {
    imdbEventUrl = parseOptionalUrl(body.imdbEventUrl);
  } catch {
    throw new ValidationError('imdbEventUrl must be a valid http(s) URL');
  }

  return {
    organizationUid,
    year,
    ceremonyNumber,
    startDate,
    endDate,
    location,
    description,
    imdbEventUrl,
  };
}

type TitleEntry = {
  languageCode: string;
  title: string;
  isDefault: number | null;
};

const pickTitle = (
  entries: TitleEntry[],
  originalLanguage: string | undefined,
): string | undefined => {
  const defaultEntry = entries.find(entry => entry.isDefault === 1);
  const jaEntry = entries.find(entry => entry.languageCode === 'ja');
  const originalEntry = originalLanguage
    ? entries.find(entry => entry.languageCode === originalLanguage)
    : undefined;
  const enEntry = entries.find(entry => entry.languageCode === 'en');
  const fallbackEntry = entries[0];

  return (defaultEntry ?? jaEntry ?? originalEntry ?? enEntry ?? fallbackEntry)
    ?.title;
};

const compareSiblings = (
  a: {year: number; ceremonyNumber: number | null},
  b: {year: number; ceremonyNumber: number | null},
): number => {
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
};

export class AdminCeremoniesService extends BaseService {
  async listCeremonies() {
    const rawCeremonies = await this.database
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

    const nominationCounts = await this.database
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

    return rawCeremonies.map(ceremony => ({
      ...ceremony,
      movieCount: countsMap.get(ceremony.uid) ?? 0,
    }));
  }

  async getCeremonyDetail(ceremonyUid: string) {
    const ceremonyResult = await this.database
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
      throw new NotFoundError('Ceremony not found');
    }

    const nominationsResult = await this.database
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

    const titlesMap = await this.loadTitles(nominationsResult);

    const siblingRows = await this.database
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
    const sortedSiblings = [...siblingRows].sort(compareSiblings);

    const currentIndex = sortedSiblings.findIndex(
      sibling => sibling.uid === ceremonyUid,
    );

    const previousCeremony =
      // eslint-disable-next-line unicorn/no-useless-undefined -- 三項の分岐として省略できない
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
  }

  async createCeremony(body: CeremonyBody) {
    const input = parseCeremonyBody(body);
    await this.assertNoCeremonyConflict(input);

    const [inserted] = await this.database
      .insert(awardCeremonies)
      .values(input)
      .returning({uid: awardCeremonies.uid});

    return this.getCeremonyDetail(inserted.uid);
  }

  async updateCeremony(ceremonyUid: string, body: CeremonyBody) {
    const input = parseCeremonyBody(body);
    await this.assertCeremonyExists(ceremonyUid);
    await this.assertNoCeremonyConflict(input, ceremonyUid);

    const now = Math.floor(Date.now() / 1000);

    await this.database
      .update(awardCeremonies)
      .set({
        ...input,
        updatedAt: now,
      })
      .where(eq(awardCeremonies.uid, ceremonyUid));

    return this.getCeremonyDetail(ceremonyUid);
  }

  async deleteCeremony(ceremonyUid: string): Promise<void> {
    await this.assertCeremonyExists(ceremonyUid);

    await this.database
      .delete(nominations)
      .where(eq(nominations.ceremonyUid, ceremonyUid));

    await this.database
      .delete(awardCeremonies)
      .where(eq(awardCeremonies.uid, ceremonyUid));
  }

  async getAwardsReference() {
    const organizations = await this.database
      .select({
        uid: awardOrganizations.uid,
        name: awardOrganizations.name,
        country: awardOrganizations.country,
      })
      .from(awardOrganizations)
      .orderBy(awardOrganizations.name);

    const ceremonies = await this.database
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

    const categories = await this.database
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

    return {organizations, ceremonies, categories};
  }

  private async loadTitles(
    nominationRows: Array<{
      movieUid: string;
      movieOriginalLanguage: string | null;
    }>,
  ): Promise<Map<string, string>> {
    const titlesMap = new Map<string, string>();
    const movieUids = [...new Set(nominationRows.map(row => row.movieUid))];
    if (movieUids.length === 0) {
      return titlesMap;
    }

    const titleRows = await this.database
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

    const translationsByMovie = new Map<string, TitleEntry[]>();
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
    for (const row of nominationRows) {
      if (originalLanguageMap.has(row.movieUid)) {
        continue;
      }

      const originalLanguage = row.movieOriginalLanguage?.trim();
      if (originalLanguage) {
        originalLanguageMap.set(row.movieUid, originalLanguage);
      }
    }

    for (const movieUid of movieUids) {
      const title = pickTitle(
        translationsByMovie.get(movieUid) ?? [],
        originalLanguageMap.get(movieUid),
      );
      if (title) {
        titlesMap.set(movieUid, title);
      }
    }

    return titlesMap;
  }

  private async assertCeremonyExists(ceremonyUid: string): Promise<void> {
    const ceremonyExists = await this.database
      .select({uid: awardCeremonies.uid})
      .from(awardCeremonies)
      .where(eq(awardCeremonies.uid, ceremonyUid))
      .limit(1);

    if (ceremonyExists.length === 0) {
      throw new NotFoundError('Ceremony not found');
    }
  }

  private async assertNoCeremonyConflict(
    input: CeremonyInput,
    excludeCeremonyUid?: string,
  ): Promise<void> {
    const {organizationUid, year, ceremonyNumber} = input;

    const organizationResult = await this.database
      .select({uid: awardOrganizations.uid})
      .from(awardOrganizations)
      .where(eq(awardOrganizations.uid, organizationUid))
      .limit(1);

    if (organizationResult.length === 0) {
      throw new NotFoundError('Organization not found');
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

    const duplicateYear = await this.database
      .select({uid: awardCeremonies.uid})
      .from(awardCeremonies)
      .where(and(...duplicateYearConditions))
      .limit(1);

    if (duplicateYear.length > 0) {
      throw new ConflictError(
        '同じ主催団体・開催年のセレモニーが既に存在します',
      );
    }

    if (ceremonyNumber === undefined) {
      return;
    }

    const duplicateNumberConditions = [
      eq(awardCeremonies.organizationUid, organizationUid),
      eq(awardCeremonies.ceremonyNumber, ceremonyNumber),
    ];
    if (excludeCeremonyUid) {
      duplicateNumberConditions.push(
        not(eq(awardCeremonies.uid, excludeCeremonyUid)),
      );
    }

    const duplicateNumber = await this.database
      .select({uid: awardCeremonies.uid})
      .from(awardCeremonies)
      .where(and(...duplicateNumberConditions))
      .limit(1);

    if (duplicateNumber.length > 0) {
      throw new ConflictError('同じ主催団体・回数のセレモニーが既に存在します');
    }
  }
}
