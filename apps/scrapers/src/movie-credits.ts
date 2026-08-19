import {and, eq, inArray, isNull, notInArray} from 'drizzle-orm';
import {type Environment, type getDatabase} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {fetchTMDBCredits, type TMDBCredits} from './common/tmdb-utilities';

type DatabaseClient = ReturnType<typeof getDatabase>;

export type SaveContext = {
  database: DatabaseClient;
  isDryRun: boolean;
};

export type ImportContext = SaveContext & {
  environment: Environment;
};

export type SelectedCredit = {
  creditId: string;
  tmdbPersonId: number;
  name: string;
  localizedName: string;
  profilePath: string | undefined;
  department: string;
  job: string | undefined;
  character: string | undefined;
  castOrder: number | undefined;
};

const MAX_CAST = 10;

const CREW_JOBS = new Set([
  'Director',
  'Screenplay',
  'Writer',
  'Story',
  'Director of Photography',
  'Original Music Composer',
  'Editor',
]);

export function selectCredits(credits: TMDBCredits): SelectedCredit[] {
  const cast = credits.cast
    .toSorted((a, b) => a.order - b.order)
    .slice(0, MAX_CAST)
    .map(member => ({
      creditId: member.credit_id,
      tmdbPersonId: member.id,
      name: member.original_name,
      localizedName: member.name,
      profilePath: member.profile_path ?? undefined,
      department: 'Acting',
      job: undefined,
      character: member.character ?? undefined,
      castOrder: member.order,
    }));

  const crew = credits.crew
    .filter(member => CREW_JOBS.has(member.job))
    .map(member => ({
      creditId: member.credit_id,
      tmdbPersonId: member.id,
      name: member.original_name,
      localizedName: member.name,
      profilePath: member.profile_path ?? undefined,
      department: member.department,
      job: member.job,
      character: undefined,
      castOrder: undefined,
    }));

  return [...cast, ...crew];
}

export async function saveMovieCredits(
  context: SaveContext,
  movieUid: string,
  credits: SelectedCredit[],
): Promise<void> {
  const tmdbPersonIds = [
    ...new Set(credits.map(credit => credit.tmdbPersonId)),
  ];
  const existing = await context.database
    .select()
    .from(people)
    .where(inArray(people.tmdbId, tmdbPersonIds));
  const known = new Set(existing.map(row => row.tmdbId));

  const missing = new Map<number, SelectedCredit>();
  for (const credit of credits) {
    if (!known.has(credit.tmdbPersonId)) {
      missing.set(credit.tmdbPersonId, credit);
    }
  }

  if (missing.size > 0 && !context.isDryRun) {
    await context.database
      .insert(people)
      .values(
        missing
          .values()
          .map(credit => ({
            tmdbId: credit.tmdbPersonId,
            name: credit.name,
            profilePath: credit.profilePath,
          }))
          .toArray(),
      )
      .onConflictDoNothing({target: people.tmdbId});
  }

  const stored = await context.database
    .select()
    .from(people)
    .where(inArray(people.tmdbId, tmdbPersonIds));
  const personUidByTmdbId = new Map(stored.map(row => [row.tmdbId, row.uid]));

  await saveJapaneseNames(context, credits, personUidByTmdbId);

  const currentCredits = await context.database
    .select()
    .from(movieCredits)
    .where(eq(movieCredits.movieUid, movieUid));
  const storedCreditIds = new Set(currentCredits.map(row => row.creditId));

  const added = credits.filter(credit => !storedCreditIds.has(credit.creditId));
  if (added.length > 0 && !context.isDryRun) {
    await context.database.insert(movieCredits).values(
      added.map(credit => ({
        movieUid,
        personUid: personUidByTmdbId.get(credit.tmdbPersonId) ?? '',
        creditId: credit.creditId,
        department: credit.department,
        job: credit.job,
        character: credit.character,
        castOrder: credit.castOrder,
      })),
    );
  }

  const keptCreditIds = credits.map(credit => credit.creditId);
  const removable = currentCredits.filter(
    row => !keptCreditIds.includes(row.creditId),
  );
  if (removable.length > 0 && !context.isDryRun) {
    await context.database
      .delete(movieCredits)
      .where(
        and(
          eq(movieCredits.movieUid, movieUid),
          notInArray(movieCredits.creditId, keptCreditIds),
        ),
      );
  }
}

async function saveJapaneseNames(
  context: SaveContext,
  credits: SelectedCredit[],
  personUidByTmdbId: Map<number, string>,
): Promise<void> {
  const translated = new Map<string, string>();
  for (const credit of credits) {
    if (credit.localizedName === credit.name) {
      continue;
    }

    const personUid = personUidByTmdbId.get(credit.tmdbPersonId);
    if (personUid) {
      translated.set(personUid, credit.localizedName);
    }
  }

  if (translated.size === 0) {
    return;
  }

  const personUids = translated.keys().toArray();
  const existing = await context.database
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.resourceType, 'person_name'),
        eq(translations.languageCode, 'ja'),
        inArray(translations.resourceUid, personUids),
      ),
    );
  const known = new Set(existing.map(row => row.resourceUid));

  const added = [...translated].filter(([personUid]) => !known.has(personUid));
  if (added.length > 0 && !context.isDryRun) {
    await context.database
      .insert(translations)
      .values(
        added.map(([personUid, content]) => ({
          resourceType: 'person_name' as const,
          resourceUid: personUid,
          languageCode: 'ja',
          content,
        })),
      )
      .onConflictDoNothing({
        target: [
          translations.resourceType,
          translations.resourceUid,
          translations.languageCode,
        ],
      });
  }
}

export type ImportOptions = {
  force?: boolean;
  limit?: number;
  throttleMs?: number;
  concurrency?: number;
  onProgress?: (processed: number, total: number) => void;
};

export type ImportResult = {
  processed: number;
  skipped: number;
  failed: number;
};

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export async function importMovieCredits(
  context: ImportContext,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const targets = await context.database
    .select({
      uid: movies.uid,
      tmdbId: movies.tmdbId,
      mediaType: movies.mediaType,
    })
    .from(movies)
    .where(isNull(movies.deletedAt));

  const importedRows = options.force
    ? []
    : await context.database
        .selectDistinct({movieUid: movieCredits.movieUid})
        .from(movieCredits);
  const alreadyImported = new Set(importedRows.map(row => row.movieUid));

  const eligible = targets.filter(
    target => target.tmdbId && !alreadyImported.has(target.uid),
  );
  const pending =
    options.limit === undefined ? eligible : eligible.slice(0, options.limit);

  let processed = 0;
  let failed = 0;
  let cursor = 0;

  async function runWorker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor++;

      if (index >= pending.length) {
        return;
      }

      const target = pending[index];

      try {
        const credits = await fetchTMDBCredits(
          target.tmdbId ?? 0,
          target.mediaType === 'tv' ? 'tv' : 'movie',
          context.environment.TMDB_API_KEY ?? '',
        );

        if (credits) {
          await saveMovieCredits(context, target.uid, selectCredits(credits));
          processed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(
          `クレジットの取り込みに失敗しました (${target.uid}):`,
          error,
        );
        failed++;
      }

      options.onProgress?.(processed + failed, pending.length);

      if (options.throttleMs) {
        await sleep(options.throttleMs);
      }
    }
  }

  const workerCount = Math.max(
    1,
    Math.min(options.concurrency ?? 1, pending.length),
  );
  await Promise.all(Array.from({length: workerCount}, async () => runWorker()));

  return {processed, skipped: targets.length - pending.length, failed};
}
