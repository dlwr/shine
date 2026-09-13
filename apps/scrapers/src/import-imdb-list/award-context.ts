import {desc, eq} from 'drizzle-orm';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {
  ensureAwardCategory,
  ensureAwardOrganization,
} from '../common/award-records';
import {type AwardContext, type DatabaseClient} from './types';

async function findOrCreateCeremony(
  database: DatabaseClient,
  organizationUid: string,
  description: string,
): Promise<string> {
  const year = new Date().getFullYear();

  await database
    .insert(awardCeremonies)
    .values({organizationUid, year, description})
    .onConflictDoNothing();

  const [row] = await database
    .select({uid: awardCeremonies.uid})
    .from(awardCeremonies)
    .where(eq(awardCeremonies.organizationUid, organizationUid))
    .orderBy(desc(awardCeremonies.year))
    .limit(1);

  if (!row) {
    throw new Error(
      `Award ceremony could not be created or found for organization.`,
    );
  }

  return row.uid;
}

export const getAwardContext = (() => {
  let cachedAwardContext: AwardContext | undefined;

  return async function getAwardContext(
    database: DatabaseClient,
    options?: {
      organizationName?: string;
      categoryName?: string;
      ceremonyName?: string;
    },
  ): Promise<AwardContext> {
    if (cachedAwardContext) {
      return cachedAwardContext;
    }

    const orgName =
      options?.organizationName ??
      process.env.AWARD_ORGANIZATION_NAME ??
      '1001 Movies You Must See Before You Die';
    const catName =
      options?.categoryName ??
      process.env.AWARD_CATEGORY_NAME ??
      'Selected Films';
    const ceremonyDescription = options?.ceremonyName ?? orgName;

    const organizationUid = await ensureAwardOrganization(database, {
      name: orgName,
    });
    const categoryUid = await ensureAwardCategory(database, organizationUid, {
      name: catName,
    });
    const ceremonyUid = await findOrCreateCeremony(
      database,
      organizationUid,
      ceremonyDescription,
    );

    console.log(
      `Award context: org="${orgName}", category="${catName}", ceremony="${ceremonyDescription}"`,
    );

    cachedAwardContext = {organizationUid, categoryUid, ceremonyUid};
    return cachedAwardContext;
  };
})();
