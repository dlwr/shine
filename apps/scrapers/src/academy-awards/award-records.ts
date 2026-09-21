import {and, eq} from 'drizzle-orm';
import {getDatabase} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {getScrapeDatabase} from '../common/dry-run';
import {type ScrapeContext} from './types';

type MainData = {
  organizationUid: string;
  categoryUid: string;
  ceremonies: Map<number, string>;
};

export const fetchMainData = (() => {
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

export async function getOrCreateCeremony(
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
