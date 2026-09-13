import {and, eq} from 'drizzle-orm';
import {nominations} from '@shine/database/schema/nominations';
import {type DatabaseClient} from './types';

export async function didCreateNomination({
  database,
  movieUid,
  categoryUid,
  ceremonyUid,
  dryRun,
  skipLookup = false,
  verbose = true,
}: {
  database: DatabaseClient;
  movieUid: string;
  categoryUid: string;
  ceremonyUid: string;
  dryRun: boolean;
  skipLookup?: boolean;
  verbose?: boolean;
}): Promise<boolean> {
  if (!skipLookup) {
    const existing = await database
      .select({uid: nominations.uid})
      .from(nominations)
      .where(
        and(
          eq(nominations.movieUid, movieUid),
          eq(nominations.categoryUid, categoryUid),
          eq(nominations.ceremonyUid, ceremonyUid),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      if (verbose) {
        console.log('  Nomination already exists.');
      }
      return false;
    }
  }

  if (dryRun) {
    if (verbose) {
      console.log('  [DRY RUN] Would create nomination (Selected Films).');
    }
    return true;
  }

  await database
    .insert(nominations)
    .values({
      movieUid,
      categoryUid,
      ceremonyUid,
      isWinner: 0,
    })
    .onConflictDoNothing();
  if (verbose) {
    console.log('  Created nomination.');
  }
  return true;
}
