import {hasJapaneseText} from '@shine/availability';
import {and, eq, sql} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {getScrapeDatabase} from './common/dry-run';
import {
  articleTitleFromUrl,
  buildJapaneseLabelQuery,
  DEFAULT_BATCH_SIZE,
  fetchSparql,
  importJapaneseLabelsInBatches,
  type JapaneseLabelBinding,
  type WikidataJapaneseLabelImportStats,
} from './common/wikidata-sparql';

export type WikidataNameImportStats = WikidataJapaneseLabelImportStats;

type SparqlResponse = {
  results?: {
    bindings?: Array<JapaneseLabelBinding & {tmdb?: {value?: string}}>;
  };
};

export function buildSparqlQuery(tmdbIds: number[]): string {
  return buildJapaneseLabelQuery({
    variable: 'tmdb',
    property: 'P4985',
    values: tmdbIds
      .filter(id => Number.isSafeInteger(id) && id > 0)
      .map(String),
  });
}

export function cleanPersonLabel(label: string): string {
  return label.replace(/\s*[（(][^（()）]*[）)]\s*$/, '').trim();
}

function usableName(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const cleaned = cleanPersonLabel(raw);
  return cleaned && hasJapaneseText(cleaned) ? cleaned : undefined;
}

export function parseSparqlResponse(
  response: SparqlResponse,
): Map<number, string> {
  const names = new Map<number, string>();
  const fromArticle = new Set<number>();

  const bindings = response.results?.bindings ?? [];
  for (const binding of bindings) {
    const tmdbId = Number(binding.tmdb?.value);
    if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
      continue;
    }

    if (fromArticle.has(tmdbId)) {
      continue;
    }

    const articleName = usableName(articleTitleFromUrl(binding.article?.value));
    if (articleName) {
      names.set(tmdbId, articleName);
      fromArticle.add(tmdbId);
      continue;
    }

    if (names.has(tmdbId)) {
      continue;
    }

    const labelName = usableName(binding.jaLabel?.value);
    if (labelName) {
      names.set(tmdbId, labelName);
    }
  }

  return names;
}

async function fetchBatch(tmdbIds: number[]): Promise<Map<number, string>> {
  return parseSparqlResponse(
    await fetchSparql<SparqlResponse>(buildSparqlQuery(tmdbIds)),
  );
}

type Candidate = {
  uid: string;
  tmdbId: number;
  name: string;
  existingJa: string | undefined;
};

async function listCandidates(
  database: ReturnType<typeof getDatabase>,
): Promise<Candidate[]> {
  const rows = await database
    .select({
      uid: people.uid,
      tmdbId: people.tmdbId,
      name: people.name,
      existingJa: sql<string | null>`(
        SELECT content FROM translations
        WHERE translations.resource_uid = people.uid
          AND translations.resource_type = 'person_name'
          AND translations.language_code = 'ja'
        LIMIT 1
      )`.as('existingJa'),
      nominationCount: sql<number>`(
        SELECT count(*) FROM nominations
        WHERE nominations.person_uid = people.uid
      )`.as('nominationCount'),
      creditCount: sql<number>`(
        SELECT count(*) FROM movie_credits
        WHERE movie_credits.person_uid = people.uid
      )`.as('creditCount'),
    })
    .from(people);

  return rows
    .filter(
      row =>
        !hasJapaneseText(row.name) &&
        (row.existingJa === null || !hasJapaneseText(row.existingJa)),
    )
    .toSorted(
      (a, b) =>
        b.nominationCount - a.nominationCount ||
        b.creditCount - a.creditCount ||
        a.tmdbId - b.tmdbId,
    )
    .map(row => ({
      uid: row.uid,
      tmdbId: row.tmdbId,
      name: row.name,
      existingJa: row.existingJa ?? undefined,
    }));
}

export async function importJapaneseNamesFromWikidata({
  environment,
  dryRun = false,
  limit,
  batchSize = DEFAULT_BATCH_SIZE,
  throttleMs = 1000,
}: {
  environment: Environment;
  dryRun?: boolean;
  limit?: number;
  batchSize?: number;
  throttleMs?: number;
}): Promise<WikidataNameImportStats> {
  const database = getScrapeDatabase({environment, isDryRun: dryRun});
  const allCandidates = await listCandidates(database);
  const candidates =
    limit === undefined ? allCandidates : allCandidates.slice(0, limit);

  return importJapaneseLabelsInBatches({
    candidates,
    subject: 'people',
    emptyMessage: 'No people need a Japanese name.',
    dryRun,
    batchSize,
    throttleMs,
    keyOf: candidate => candidate.tmdbId,
    fetchLabels: fetchBatch,
    apply: async (candidate, name, stats) =>
      applyCandidateName({database, candidate, name, dryRun, stats}),
  });
}

async function applyCandidateName({
  database,
  candidate,
  name,
  dryRun,
  stats,
}: {
  database: ReturnType<typeof getDatabase>;
  candidate: Candidate;
  name: string | undefined;
  dryRun: boolean;
  stats: WikidataNameImportStats;
}): Promise<void> {
  if (!name) {
    stats.notFound++;
    return;
  }

  const isReplacement = candidate.existingJa !== undefined;
  console.log(
    `  ${candidate.name} (${candidate.tmdbId}): ${isReplacement ? `${candidate.existingJa} -> ` : ''}${name}`,
  );

  if (isReplacement) {
    stats.replaced++;
  } else {
    stats.saved++;
  }

  if (dryRun) {
    return;
  }

  await saveJapaneseName(database, candidate, name);
}

async function saveJapaneseName(
  database: ReturnType<typeof getDatabase>,
  candidate: Candidate,
  name: string,
): Promise<void> {
  if (candidate.existingJa === undefined) {
    await database
      .insert(translations)
      .values({
        resourceType: 'person_name',
        resourceUid: candidate.uid,
        languageCode: 'ja',
        content: name,
      })
      .onConflictDoNothing();
    return;
  }

  await database
    .update(translations)
    .set({content: name})
    .where(
      and(
        eq(translations.resourceUid, candidate.uid),
        eq(translations.resourceType, 'person_name'),
        eq(translations.languageCode, 'ja'),
      ),
    );
}
