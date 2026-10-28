import {setTimeout as sleep} from 'node:timers/promises';
import {runBatch, type WriteStatement, type getDatabase} from '@shine/database';
import {people} from '@shine/database/schema/people';
import {and, eq, isNull, sql} from 'drizzle-orm';

type DatabaseClient = ReturnType<typeof getDatabase>;

export type BirthdayBackfillContext = {
  database: DatabaseClient;
  isDryRun: boolean;
  fetchBirthday: (tmdbId: number) => Promise<string | null | undefined>;
  limit?: number;
  throttleMs?: number;
  batchSize?: number;
  onProgress?: (done: number, total: number) => void;
};

export type BirthdayBackfillStats = {
  candidates: number;
  saved: number;
  missing: number;
  failed: number;
};

const MINIMUM_CREDITS = 3;

const isNominated = sql<number>`EXISTS (
  SELECT 1 FROM nominations WHERE nominations.person_uid = people.uid
)`;
const creditCount = sql<number>`(
  SELECT COUNT(*) FROM movie_credits WHERE movie_credits.person_uid = people.uid
)`;

/** 誕生日の無い人物のうち、/on-this-day に出しうる人物の誕生日を TMDb から埋める */
export async function backfillPersonBirthdays(
  context: BirthdayBackfillContext,
): Promise<BirthdayBackfillStats> {
  const query = context.database
    .select({uid: people.uid, tmdbId: people.tmdbId})
    .from(people)
    .where(
      and(
        isNull(people.birthday),
        sql`(${isNominated} OR ${creditCount} >= ${MINIMUM_CREDITS})`,
      ),
    )
    .orderBy(sql`${isNominated} DESC`, sql`${creditCount} DESC`, people.uid);
  const targets = await (context.limit === undefined
    ? query
    : query.limit(context.limit));

  const stats: BirthdayBackfillStats = {
    candidates: targets.length,
    saved: 0,
    missing: 0,
    failed: 0,
  };
  const batchSize = context.batchSize ?? 50;
  let pending: WriteStatement[] = [];

  for (const [index, target] of targets.entries()) {
    try {
      const birthday = await context.fetchBirthday(target.tmdbId);
      if (birthday && /^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
        stats.saved++;
        if (!context.isDryRun) {
          pending.push(
            context.database
              .update(people)
              .set({birthday})
              .where(and(eq(people.uid, target.uid), isNull(people.birthday))),
          );
        }
      } else {
        stats.missing++;
      }
    } catch (error) {
      stats.failed++;
      console.error(`誕生日の取得に失敗しました: TMDb ${target.tmdbId}`, error);
    }

    if (pending.length >= batchSize) {
      await runBatch(context.database, pending);
      pending = [];
    }

    context.onProgress?.(index + 1, targets.length);

    if (context.throttleMs && index + 1 < targets.length) {
      await sleep(context.throttleMs);
    }
  }

  await runBatch(context.database, pending);
  return stats;
}
