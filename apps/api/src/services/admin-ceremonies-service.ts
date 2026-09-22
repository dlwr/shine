import {and, eq, isNull, not, sql} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {BaseService} from './base-service';
import {
  parseCeremonyBody,
  type CeremonyBody,
  type CeremonyInput,
} from './ceremony-input';
import {ceremonyNavigation} from './ceremony-navigation';
import {ConflictError, NotFoundError} from './errors';
import {loadNominationMovieTitles} from './nomination-movie-titles';

export {type CeremonyBody} from './ceremony-input';

const ceremonyColumns = {
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
};

export class AdminCeremoniesService extends BaseService {
  async listCeremonies() {
    const rawCeremonies = await this.database
      .select(ceremonyColumns)
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
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .where(isNull(movies.deletedAt))
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
      .select(ceremonyColumns)
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
      .where(
        and(eq(nominations.ceremonyUid, ceremonyUid), isNull(movies.deletedAt)),
      )
      .orderBy(awardCategories.name, movies.year);

    const titlesMap = await loadNominationMovieTitles(
      this.database,
      nominationsResult,
    );

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
      navigation: ceremonyNavigation(siblingRows, ceremonyUid),
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
        shortName: awardOrganizations.shortName,
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
