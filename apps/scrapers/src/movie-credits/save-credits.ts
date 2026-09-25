import {and, eq, inArray, isNotNull} from 'drizzle-orm';
import {inChunks, runInChunks, type getDatabase} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {hasOnlyLatinOrJapaneseScript} from '@shine/utils';
import {type SelectedCredit} from './select-credits';

type DatabaseClient = ReturnType<typeof getDatabase>;

export type SaveContext = {
  database: DatabaseClient;
  isDryRun: boolean;
};

/** 人物・日本語名・クレジットを足す。既存のクレジットは消さない */
export async function upsertMovieCredits(
  context: SaveContext,
  movieUid: string,
  credits: SelectedCredit[],
): Promise<Map<number, string>> {
  const tmdbPersonIds = [
    ...new Set(credits.map(credit => credit.tmdbPersonId)),
  ];
  const existing = await inChunks(tmdbPersonIds, chunk =>
    context.database.select().from(people).where(inArray(people.tmdbId, chunk)),
  );
  const known = new Set(existing.map(row => row.tmdbId));

  const missing = new Map<number, SelectedCredit>();
  for (const credit of credits) {
    if (!known.has(credit.tmdbPersonId)) {
      missing.set(credit.tmdbPersonId, credit);
    }
  }

  if (missing.size > 0 && !context.isDryRun) {
    await runInChunks(missing.values().toArray(), chunk =>
      context.database
        .insert(people)
        .values(
          chunk.map(credit => ({
            tmdbId: credit.tmdbPersonId,
            name: credit.name,
            profilePath: credit.profilePath,
          })),
        )
        .onConflictDoNothing({target: people.tmdbId}),
    );
  }

  const stored = await inChunks(tmdbPersonIds, chunk =>
    context.database.select().from(people).where(inArray(people.tmdbId, chunk)),
  );
  const personUidByTmdbId = new Map(stored.map(row => [row.tmdbId, row.uid]));

  await savePersonNames(
    context,
    'ja',
    japaneseNames(credits),
    personUidByTmdbId,
  );
  await savePersonNames(
    context,
    'en',
    englishNames(credits),
    personUidByTmdbId,
  );

  const currentCredits = await context.database
    .select()
    .from(movieCredits)
    .where(eq(movieCredits.movieUid, movieUid));
  const storedCreditIds = new Set(currentCredits.map(row => row.creditId));

  const added = credits.filter(credit => !storedCreditIds.has(credit.creditId));
  if (added.length > 0 && !context.isDryRun) {
    await runInChunks(added, chunk =>
      context.database.insert(movieCredits).values(
        chunk.map(credit => ({
          movieUid,
          personUid: personUidByTmdbId.get(credit.tmdbPersonId) ?? '',
          creditId: credit.creditId,
          department: credit.department,
          job: credit.job,
          character: credit.character,
          castOrder: credit.castOrder,
        })),
      ),
    );
  }

  return personUidByTmdbId;
}

export async function saveMovieCredits(
  context: SaveContext,
  movieUid: string,
  credits: SelectedCredit[],
): Promise<void> {
  await upsertMovieCredits(context, movieUid, credits);

  const nominated = await context.database
    .selectDistinct({personUid: nominations.personUid})
    .from(nominations)
    .where(
      and(eq(nominations.movieUid, movieUid), isNotNull(nominations.personUid)),
    );
  const currentCredits = await context.database
    .select()
    .from(movieCredits)
    .where(eq(movieCredits.movieUid, movieUid));
  const keptCreditIds = new Set([
    ...credits.map(credit => credit.creditId),
    ...currentCredits
      .filter(row => nominated.some(entry => entry.personUid === row.personUid))
      .map(row => row.creditId),
  ]);
  const removable = currentCredits
    .filter(row => !keptCreditIds.has(row.creditId))
    .map(row => row.creditId);
  if (removable.length > 0 && !context.isDryRun) {
    await runInChunks(removable, chunk =>
      context.database
        .delete(movieCredits)
        .where(inArray(movieCredits.creditId, chunk)),
    );
  }
}

function japaneseNames(credits: SelectedCredit[]): Map<number, string> {
  return new Map(
    credits
      .filter(credit => credit.localizedName !== credit.name)
      .map(credit => [credit.tmdbPersonId, credit.localizedName]),
  );
}

/** 原語がラテン文字でも日本語でもない人物だけ、英語表記を持たせる */
function englishNames(credits: SelectedCredit[]): Map<number, string> {
  return new Map(
    credits
      .filter(
        (credit): credit is SelectedCredit & {englishName: string} =>
          credit.englishName !== undefined &&
          credit.englishName !== credit.name &&
          !hasOnlyLatinOrJapaneseScript(credit.name),
      )
      .map(credit => [credit.tmdbPersonId, credit.englishName]),
  );
}

async function savePersonNames(
  context: SaveContext,
  languageCode: 'ja' | 'en',
  namesByTmdbId: Map<number, string>,
  personUidByTmdbId: Map<number, string>,
): Promise<void> {
  const translated = new Map<string, string>();
  for (const [tmdbPersonId, content] of namesByTmdbId) {
    const personUid = personUidByTmdbId.get(tmdbPersonId);
    if (personUid) {
      translated.set(personUid, content);
    }
  }

  if (translated.size === 0) {
    return;
  }

  const personUids = translated.keys().toArray();
  const existing = await inChunks(personUids, chunk =>
    context.database
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.resourceType, 'person_name'),
          eq(translations.languageCode, languageCode),
          inArray(translations.resourceUid, chunk),
        ),
      ),
  );
  const known = new Set(existing.map(row => row.resourceUid));

  const added = [...translated].filter(([personUid]) => !known.has(personUid));
  if (added.length > 0 && !context.isDryRun) {
    await runInChunks(added, chunk =>
      context.database
        .insert(translations)
        .values(
          chunk.map(([personUid, content]) => ({
            resourceType: 'person_name' as const,
            resourceUid: personUid,
            languageCode,
            content,
          })),
        )
        .onConflictDoNothing({
          target: [
            translations.resourceType,
            translations.resourceUid,
            translations.languageCode,
          ],
        }),
    );
  }
}
