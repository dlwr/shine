import {hasJapaneseText} from '@shine/availability';
import {and, eq, inArray, isNull} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';

const BATCH_SIZE = 50;

async function saveJapaneseTitle(
  database: ReturnType<typeof getDatabase>,
  movieUid: string,
  title: string,
): Promise<'saved' | 'replaced' | 'skipped'> {
  const [existing] = await database
    .select({uid: translations.uid, content: translations.content})
    .from(translations)
    .where(
      and(
        eq(translations.resourceUid, movieUid),
        eq(translations.resourceType, 'movie_title'),
        eq(translations.languageCode, 'ja'),
      ),
    )
    .limit(1);

  if (existing === undefined) {
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: movieUid,
      languageCode: 'ja',
      content: title,
      isDefault: 0,
    });
    return 'saved';
  }

  if (!hasJapaneseText(existing.content)) {
    await database
      .update(translations)
      .set({content: title})
      .where(eq(translations.uid, existing.uid));
    return 'replaced';
  }

  return 'skipped';
}

/** Wikipediaの表記は邦題として信頼できるので、TMDb由来の原題を上書きする */
export async function backfillJapaneseTitlesByImdbId(
  environment: Environment,
  titleByImdbId: Map<string, string>,
): Promise<{saved: number; replaced: number}> {
  const database = getDatabase(environment);
  const stats = {saved: 0, replaced: 0};
  const imdbIds = titleByImdbId.keys().toArray();

  for (let index = 0; index < imdbIds.length; index += BATCH_SIZE) {
    const batch = imdbIds.slice(index, index + BATCH_SIZE);
    const rows = await database
      .select({uid: movies.uid, imdbId: movies.imdbId})
      .from(movies)
      .where(and(inArray(movies.imdbId, batch), isNull(movies.deletedAt)));

    for (const row of rows) {
      const title = row.imdbId ? titleByImdbId.get(row.imdbId) : undefined;
      if (title) {
        const outcome = await saveJapaneseTitle(database, row.uid, title);
        if (outcome === 'saved') {
          stats.saved++;
        } else if (outcome === 'replaced') {
          stats.replaced++;
        }
      }
    }
  }

  return stats;
}
