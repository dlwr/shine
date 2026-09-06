import {type getDatabase} from '@shine/database';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {hasOnlyLatinOrJapaneseScript} from '@shine/utils';
import {and, eq, isNull} from 'drizzle-orm';

type DatabaseClient = ReturnType<typeof getDatabase>;

export type BackfillContext = {
  database: DatabaseClient;
  isDryRun: boolean;
  fetchEnglishName: (tmdbId: number) => Promise<string | undefined>;
  limit?: number;
  throttleMs?: number;
  onProgress?: (done: number, total: number) => void;
};

export type BackfillStats = {
  candidates: number;
  saved: number;
  skipped: number;
  failed: number;
};

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/** 原語がラテン文字でも日本語でもない人物に、TMDb の英語表記を en の person_name として足す */
export async function backfillPersonEnglishNames(
  context: BackfillContext,
): Promise<BackfillStats> {
  const rows = await context.database
    .select({uid: people.uid, tmdbId: people.tmdbId, name: people.name})
    .from(people)
    .leftJoin(
      translations,
      and(
        eq(translations.resourceUid, people.uid),
        eq(translations.resourceType, 'person_name'),
        eq(translations.languageCode, 'en'),
      ),
    )
    .where(isNull(translations.uid))
    .orderBy(people.uid);

  const eligible = rows.filter(row => !hasOnlyLatinOrJapaneseScript(row.name));
  const targets =
    context.limit === undefined ? eligible : eligible.slice(0, context.limit);
  const stats: BackfillStats = {
    candidates: targets.length,
    saved: 0,
    skipped: 0,
    failed: 0,
  };

  for (const [index, target] of targets.entries()) {
    const englishName = await context.fetchEnglishName(target.tmdbId);

    if (englishName === undefined) {
      stats.failed++;
    } else if (
      englishName === target.name ||
      !hasOnlyLatinOrJapaneseScript(englishName)
    ) {
      stats.skipped++;
    } else {
      if (!context.isDryRun) {
        await context.database
          .insert(translations)
          .values({
            resourceType: 'person_name',
            resourceUid: target.uid,
            languageCode: 'en',
            content: englishName,
          })
          .onConflictDoNothing({
            target: [
              translations.resourceType,
              translations.resourceUid,
              translations.languageCode,
            ],
          });
      }

      stats.saved++;
    }

    context.onProgress?.(index + 1, targets.length);

    if (context.throttleMs && index + 1 < targets.length) {
      await sleep(context.throttleMs);
    }
  }

  return stats;
}
