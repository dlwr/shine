import {and, eq} from 'drizzle-orm';
import {type getDatabase} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardOrganizations} from '@shine/database/schema/award-organizations';

type DatabaseClient = ReturnType<typeof getDatabase>;

export async function ensureAwardOrganization(
  database: DatabaseClient,
  values: {name: string; country?: string; establishedYear?: number},
): Promise<string> {
  await database
    .insert(awardOrganizations)
    .values(values)
    .onConflictDoNothing();

  const [row] = await database
    .select({uid: awardOrganizations.uid})
    .from(awardOrganizations)
    .where(eq(awardOrganizations.name, values.name))
    .limit(1);

  if (!row) {
    throw new Error(
      `Award organization "${values.name}" could not be created or found.`,
    );
  }

  return row.uid;
}

export async function ensureAwardCategory(
  database: DatabaseClient,
  organizationUid: string,
  values: {name: string; shortName?: string},
): Promise<string> {
  await database
    .insert(awardCategories)
    .values({organizationUid, ...values})
    .onConflictDoNothing();

  const [row] = await database
    .select({uid: awardCategories.uid})
    .from(awardCategories)
    .where(
      and(
        eq(awardCategories.organizationUid, organizationUid),
        eq(awardCategories.name, values.name),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error(
      `Award category "${values.name}" could not be created or found.`,
    );
  }

  return row.uid;
}
