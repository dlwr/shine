import {and, eq, sql} from 'drizzle-orm';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {type DatabaseClient, type ImdbEventAwardConfig} from './types';

export async function ensureOrganization(
  database: DatabaseClient,
  config: ImdbEventAwardConfig,
): Promise<string> {
  await database
    .insert(awardOrganizations)
    .values({
      name: config.organizationName,
      country: config.organizationCountry,
      establishedYear: config.establishedYear,
    })
    .onConflictDoNothing();

  const [row] = await database
    .select({uid: awardOrganizations.uid})
    .from(awardOrganizations)
    .where(eq(awardOrganizations.name, config.organizationName))
    .limit(1);

  if (!row) {
    throw new Error(`Failed to create ${config.organizationName} organization`);
  }

  return row.uid;
}

export async function ensureCategory(
  database: DatabaseClient,
  organizationUid: string,
  config: ImdbEventAwardConfig,
): Promise<string> {
  await database
    .insert(awardCategories)
    .values({
      organizationUid,
      name: config.categoryName,
      shortName: config.categoryShortName ?? config.categoryName,
    })
    .onConflictDoNothing();

  const [row] = await database
    .select({uid: awardCategories.uid})
    .from(awardCategories)
    .where(
      and(
        eq(awardCategories.organizationUid, organizationUid),
        eq(awardCategories.name, config.categoryName),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error(`Failed to create ${config.categoryName} category`);
  }

  return row.uid;
}

export async function ensureCeremony(
  database: DatabaseClient,
  organizationUid: string,
  year: number,
  config: ImdbEventAwardConfig,
): Promise<string> {
  const ceremonyNumber = config.ceremonyNumber(year);
  const [row] = await database
    .insert(awardCeremonies)
    .values({organizationUid, year, ceremonyNumber})
    .onConflictDoUpdate({
      target: [awardCeremonies.organizationUid, awardCeremonies.year],
      set: {ceremonyNumber: ceremonyNumber ?? sql`NULL`},
    })
    .returning();

  return row.uid;
}
