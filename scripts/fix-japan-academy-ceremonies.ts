import {config as loadEnv} from 'dotenv';

import {getDatabase, type Environment} from '@shine/database';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {asc, eq} from 'drizzle-orm';

loadEnv({path: '.dev.vars', override: true});
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  loadEnv();
}

type CeremonyRecord = {
  uid: string;
  year: number;
  ceremonyNumber: number | null;
};

type MissingCeremony = {
  year: number;
  expectedNumber: number;
};

function resolveEnvironment(): Environment {
  const url =
    process.env.TURSO_DATABASE_URL_PROD ||
    process.env.TURSO_DATABASE_URL ||
    process.env.TURSO_DATABASE_URL_DEV;
  const authToken =
    process.env.TURSO_AUTH_TOKEN_PROD ||
    process.env.TURSO_AUTH_TOKEN ||
    process.env.TURSO_AUTH_TOKEN_DEV;

  if (!url || !authToken) {
    throw new Error(
      'Missing Turso credentials. Set TURSO_DATABASE_URL(_PROD) and TURSO_AUTH_TOKEN(_PROD).',
    );
  }

  return {
    TURSO_DATABASE_URL: url,
    TURSO_AUTH_TOKEN: authToken,
  };
}

async function main() {
  const environment = resolveEnvironment();
  const database = getDatabase(environment);

  const organization = await database
    .select({
      uid: awardOrganizations.uid,
    })
    .from(awardOrganizations)
    .where(eq(awardOrganizations.name, 'Japan Academy Awards'))
    .limit(1)
    .then(rows => rows[0]);

  if (!organization) {
    throw new Error('Japan Academy Awards organization not found.');
  }

  const ceremonies = await database
    .select({
      uid: awardCeremonies.uid,
      year: awardCeremonies.year,
      ceremonyNumber: awardCeremonies.ceremonyNumber,
    })
    .from(awardCeremonies)
    .where(eq(awardCeremonies.organizationUid, organization.uid))
    .orderBy(asc(awardCeremonies.year));

  const updates: Array<{
    record: CeremonyRecord;
    expected: number;
  }> = [];
  const missing: MissingCeremony[] = [];
  const ceremoniesByYear = new Map<number, CeremonyRecord>();
  const seenYears: number[] = [];

  for (const ceremony of ceremonies) {
    if (ceremony.year == null) {
      continue;
    }

    ceremoniesByYear.set(ceremony.year, ceremony);
    seenYears.push(ceremony.year);

    const expected = ceremony.year - 1977;

    if (expected <= 0) {
      continue;
    }

    if (ceremony.ceremonyNumber !== expected) {
      updates.push({
        record: ceremony,
        expected,
      });
    }
  }

  if (seenYears.length > 0) {
    const minYear = Math.min(...seenYears);
    const maxYear = Math.max(...seenYears);

    for (let year = minYear; year <= maxYear; year++) {
      const expectedNumber = year - 1977;

      if (expectedNumber <= 0) {
        continue;
      }

      if (!ceremoniesByYear.has(year)) {
        missing.push({
          year,
          expectedNumber,
        });
      }
    }
  }

  if (updates.length === 0 && missing.length === 0) {
    console.log(
      'No mismatched ceremony numbers or missing ceremonies detected.',
    );
    return;
  }

  if (updates.length > 0) {
    console.log('Detected mismatches:');
    for (const {record, expected} of updates) {
      console.log(
        `  Year ${record.year}: ceremonyNumber ${record.ceremonyNumber} -> ${expected}`,
      );
    }
  }

  if (missing.length > 0) {
    console.log('Detected missing ceremonies:');
    for (const {year, expectedNumber} of missing) {
      console.log(`  Year ${year}: missing ceremonyNumber ${expectedNumber}`);
    }
  }

  if (!process.argv.includes('--apply')) {
    console.log(
      '\nRun again with --apply to update ceremony numbers or insert missing ceremonies.',
    );
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);

  for (const {record, expected} of updates) {
    await database
      .update(awardCeremonies)
      .set({
        ceremonyNumber: expected,
        updatedAt: timestamp,
      })
      .where(eq(awardCeremonies.uid, record.uid));
  }

  if (missing.length > 0) {
    for (const {year, expectedNumber} of missing) {
      await database.insert(awardCeremonies).values({
        organizationUid: organization.uid,
        year,
        ceremonyNumber: expectedNumber,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  if (updates.length > 0) {
    console.log(`Updated ${updates.length} ceremony records.`);
  }

  if (missing.length > 0) {
    console.log(`Inserted ${missing.length} ceremony records.`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
