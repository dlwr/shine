import {and, desc, eq} from 'drizzle-orm';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {type AwardContext, type DatabaseClient} from './types';

async function findOrCreateOrganization(
  database: DatabaseClient,
  name: string,
): Promise<string> {
  await database
    .insert(awardOrganizations)
    .values({name})
    .onConflictDoNothing();

  const [row] = await database
    .select({uid: awardOrganizations.uid})
    .from(awardOrganizations)
    .where(eq(awardOrganizations.name, name))
    .limit(1);

  if (!row) {
    throw new Error(
      `Award organization "${name}" could not be created or found.`,
    );
  }

  return row.uid;
}

async function findOrCreateCategory(
  database: DatabaseClient,
  organizationUid: string,
  name: string,
): Promise<string> {
  await database
    .insert(awardCategories)
    .values({organizationUid, name})
    .onConflictDoNothing();

  const [row] = await database
    .select({uid: awardCategories.uid})
    .from(awardCategories)
    .where(
      and(
        eq(awardCategories.organizationUid, organizationUid),
        eq(awardCategories.name, name),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error(`Award category "${name}" could not be created or found.`);
  }

  return row.uid;
}

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

    const organizationUid = await findOrCreateOrganization(database, orgName);
    const categoryUid = await findOrCreateCategory(
      database,
      organizationUid,
      catName,
    );
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
