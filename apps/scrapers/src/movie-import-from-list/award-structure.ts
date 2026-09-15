import {and, eq} from 'drizzle-orm';
import {getDatabase} from '@shine/database';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {
  ensureAwardCategory,
  ensureAwardOrganization,
} from '../common/award-records';
import {type ImportContext} from './tmdb-movie';

/**
 * アワード組織、カテゴリー、セレモニーを作成
 */
export async function createAwardStructure(
  context: ImportContext,
  awardName: string,
  categoryName: string,
): Promise<{
  organizationUid: string;
  categoryUid: string;
  ceremonyUid: string;
}> {
  if (context.isDryRun) {
    console.log(
      `[DRY RUN] Would create award structure for: ${awardName} - ${categoryName}`,
    );
    return {
      organizationUid: 'dry-run-org-uid',
      categoryUid: 'dry-run-category-uid',
      ceremonyUid: 'dry-run-ceremony-uid',
    };
  }

  const database = getDatabase(context.environment);

  const organizationUid = await ensureAwardOrganization(database, {
    name: awardName,
    country: 'Unknown',
  });
  const categoryUid = await ensureAwardCategory(database, organizationUid, {
    name: categoryName,
    shortName: categoryName,
  });

  // セレモニーを作成/取得
  const currentYear = new Date().getFullYear();
  await database
    .insert(awardCeremonies)
    .values({
      organizationUid,
      year: currentYear,
      startDate: Math.floor(Date.now() / 1000),
    })
    .onConflictDoNothing();

  const [ceremony] = await database
    .select()
    .from(awardCeremonies)
    .where(
      and(
        eq(awardCeremonies.year, currentYear),
        eq(awardCeremonies.organizationUid, organizationUid),
      ),
    );

  if (!ceremony) {
    throw new Error(`Failed to create ceremony for year: ${currentYear}`);
  }

  return {organizationUid, categoryUid, ceremonyUid: ceremony.uid};
}
