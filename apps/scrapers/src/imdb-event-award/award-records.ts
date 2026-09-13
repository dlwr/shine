import {sql} from 'drizzle-orm';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {
  ensureAwardCategory,
  ensureAwardOrganization,
} from '../common/award-records';
import {type DatabaseClient, type ImdbEventAwardConfig} from './types';

export async function ensureOrganization(
  database: DatabaseClient,
  config: ImdbEventAwardConfig,
): Promise<string> {
  return ensureAwardOrganization(database, {
    name: config.organizationName,
    country: config.organizationCountry,
    establishedYear: config.establishedYear,
  });
}

export async function ensureCategory(
  database: DatabaseClient,
  organizationUid: string,
  config: ImdbEventAwardConfig,
): Promise<string> {
  return ensureAwardCategory(database, organizationUid, {
    name: config.categoryName,
    shortName: config.categoryShortName ?? config.categoryName,
  });
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
