import {and, eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {resolveCorrectMovie} from './fix-misattributed-nominations/correct-movie';
import {
  type Database,
  type FixMisattributedStats,
  type MisattributedNomination,
} from './fix-misattributed-nominations/types';

type FixOptions = {
  environment: Environment;
  entries: MisattributedNomination[];
  dryRun?: boolean;
  throttleMs?: number;
};

const sleep = async (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

async function findTargetNomination(
  database: Database,
  entry: MisattributedNomination,
): Promise<{uid: string; movieUid: string} | undefined> {
  const rows = await database
    .select({uid: nominations.uid, movieUid: nominations.movieUid})
    .from(nominations)
    .innerJoin(movies, eq(movies.uid, nominations.movieUid))
    .innerJoin(
      awardCeremonies,
      eq(awardCeremonies.uid, nominations.ceremonyUid),
    )
    .innerJoin(
      awardOrganizations,
      eq(awardOrganizations.uid, awardCeremonies.organizationUid),
    )
    .innerJoin(
      awardCategories,
      eq(awardCategories.uid, nominations.categoryUid),
    )
    .where(
      and(
        eq(movies.imdbId, entry.wrongImdbId),
        eq(awardCeremonies.year, entry.ceremonyYear),
        eq(awardOrganizations.name, entry.organization),
        eq(awardCategories.name, entry.category),
        entry.specialMention
          ? eq(nominations.specialMention, entry.specialMention)
          : undefined,
      ),
    );

  if (rows.length > 1) {
    throw new Error(
      `${entry.organization} ${entry.ceremonyYear} ${entry.wrongImdbId} に一致するノミネーションが${rows.length}件あります`,
    );
  }

  return rows[0];
}

async function hasSameNomination(
  database: Database,
  nominationUid: string,
  movieUid: string,
): Promise<boolean> {
  const [target] = await database
    .select({
      ceremonyUid: nominations.ceremonyUid,
      categoryUid: nominations.categoryUid,
    })
    .from(nominations)
    .where(eq(nominations.uid, nominationUid));

  const rows = await database
    .select({uid: nominations.uid})
    .from(nominations)
    .where(
      and(
        eq(nominations.movieUid, movieUid),
        eq(nominations.ceremonyUid, target.ceremonyUid),
        eq(nominations.categoryUid, target.categoryUid),
      ),
    );

  return rows.length > 0;
}

export async function fixMisattributedNominations({
  environment,
  entries,
  dryRun = false,
  throttleMs = 0,
}: FixOptions): Promise<FixMisattributedStats> {
  const database = getDatabase(environment);
  const stats: FixMisattributedStats = {
    repointed: 0,
    deletedDuplicate: 0,
    moviesCreated: 0,
    moviesRevived: 0,
    skipped: 0,
    failed: 0,
    affectedMovieUids: [],
  };
  const affected = new Set<string>();

  for (const entry of entries) {
    const label = `${entry.organization} ${entry.ceremonyYear}${
      entry.specialMention ? ` ${entry.specialMention}` : ''
    } ${entry.correctTitle}`;

    try {
      const nomination = await findTargetNomination(database, entry);

      if (!nomination) {
        console.log(`  対象なし（修正済み）: ${label}`);
        stats.skipped++;
        continue;
      }

      if (dryRun) {
        console.log(
          `  [dry-run] ${label}: ${entry.wrongImdbId} → ${entry.correctImdbId ?? '(IMDb ID無し)'}`,
        );
        stats.repointed++;
        continue;
      }

      const correctMovieUid = await resolveCorrectMovie(
        database,
        environment,
        entry,
        stats,
      );

      if (await hasSameNomination(database, nomination.uid, correctMovieUid)) {
        await database
          .delete(nominations)
          .where(eq(nominations.uid, nomination.uid));
        stats.deletedDuplicate++;
        console.log(`  重複のため削除: ${label}`);
      } else {
        await database
          .update(nominations)
          .set({movieUid: correctMovieUid})
          .where(eq(nominations.uid, nomination.uid));
        stats.repointed++;
        console.log(`  付け替え: ${label}`);
      }

      affected.add(nomination.movieUid);
      affected.add(correctMovieUid);

      if (throttleMs > 0) {
        await sleep(throttleMs);
      }
    } catch (error) {
      console.error(`  失敗: ${label}`, error);
      stats.failed++;
    }
  }

  stats.affectedMovieUids = [...affected];
  return stats;
}
