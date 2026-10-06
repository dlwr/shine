import {hasJapaneseText} from '@shine/availability';
import {and, eq, isNotNull, isNull, sql} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {hasKana} from './common/japanese-text';
import {
  articleTitleFromUrl,
  buildJapaneseLabelQuery,
  DEFAULT_BATCH_SIZE,
  fetchSparql,
  importJapaneseLabelsInBatches,
  type JapaneseLabelBinding,
  type WikidataJapaneseLabelImportStats,
} from './common/wikidata-sparql';

const IMDB_ID_PATTERN = /^tt\d+$/;

export type WikidataImportStats = WikidataJapaneseLabelImportStats;

type SparqlResponse = {
  results?: {
    bindings?: Array<JapaneseLabelBinding & {imdb?: {value?: string}}>;
  };
};

export function buildSparqlQuery(imdbIds: string[]): string {
  return buildJapaneseLabelQuery({
    variable: 'imdb',
    property: 'P345',
    values: imdbIds.filter(id => IMDB_ID_PATTERN.test(id)),
  });
}

/** Wikidataのラベルや記事名は同名作品を区別するため「(映画)」「(1994年のテレビドラマ)」等が付くことがある */
export function cleanWikidataLabel(label: string): string {
  return label
    .replace(
      /\s*[（(][^（()）]*(?:映画|テレビ|ドラマ|アニメ|\d{4}年)[^（()）]*[）)]\s*$/,
      '',
    )
    .trim();
}

export function isSameTitle(a: string, b: string): boolean {
  return a.normalize('NFKC') === b.normalize('NFKC');
}

/** tt0093765 は ja ラベルが「1988年版」で記事も無く、tt3026308 は P345 が原作小説の項目に付いている */
const BROKEN_WIKIDATA_ENTRIES = new Set(['tt0093765', 'tt3026308']);

export function parseSparqlResponse(
  response: SparqlResponse,
): Map<string, string> {
  const titles = new Map<string, string>();
  const fromArticle = new Set<string>();

  const bindings = response.results?.bindings ?? [];
  for (const binding of bindings) {
    const imdbId = binding.imdb?.value;
    if (!imdbId || BROKEN_WIKIDATA_ENTRIES.has(imdbId)) {
      continue;
    }

    // ラベルは壊れていることがあるので、ja.wikipediaの記事名を優先する
    const articleTitle = articleTitleFromUrl(binding.article?.value);
    if (articleTitle) {
      const cleaned = cleanWikidataLabel(articleTitle);
      if (cleaned && hasJapaneseText(cleaned)) {
        titles.set(imdbId, cleaned);
        fromArticle.add(imdbId);
        continue;
      }
    }

    if (fromArticle.has(imdbId)) {
      continue;
    }

    const label = binding.jaLabel?.value;
    if (!label) {
      continue;
    }

    const cleaned = cleanWikidataLabel(label);
    if (!cleaned || !hasJapaneseText(cleaned)) {
      continue;
    }

    titles.set(imdbId, cleaned);
  }

  return titles;
}

async function fetchBatch(imdbIds: string[]): Promise<Map<string, string>> {
  return parseSparqlResponse(
    await fetchSparql<SparqlResponse>(buildSparqlQuery(imdbIds)),
  );
}

type Candidate = {
  uid: string;
  imdbId: string;
  existingJa: string | undefined;
};

export async function importJapaneseTitlesFromWikidata({
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
}): Promise<WikidataImportStats> {
  const database = getDatabase(environment);
  const rows = await database
    .select({
      uid: movies.uid,
      imdbId: movies.imdbId,
      originalLanguage: movies.originalLanguage,
      existingJa: sql<string | null>`(
        SELECT content FROM translations
        WHERE translations.resource_uid = movies.uid
          AND translations.resource_type = 'movie_title'
          AND translations.language_code = 'ja'
        LIMIT 1
      )`.as('existingJa'),
    })
    .from(movies)
    .where(and(isNull(movies.deletedAt), isNotNull(movies.imdbId)));

  // 邦題が無いもの、原題がそのままjaとして入っているもの、
  // 原語がja以外なのにかなを含まないもの（中国語原題の素通し対策）が対象
  const allCandidates: Candidate[] = rows
    .filter(
      row =>
        row.existingJa === null ||
        !hasJapaneseText(row.existingJa) ||
        (row.originalLanguage !== 'ja' && !hasKana(row.existingJa)),
    )
    .map(row => ({
      uid: row.uid,
      imdbId: row.imdbId ?? '',
      existingJa: row.existingJa ?? undefined,
    }))
    .filter(candidate => IMDB_ID_PATTERN.test(candidate.imdbId));

  const candidates =
    limit === undefined ? allCandidates : allCandidates.slice(0, limit);

  return importJapaneseLabelsInBatches({
    candidates,
    subject: 'movies',
    emptyMessage: 'No movies need a Japanese title.',
    dryRun,
    batchSize,
    throttleMs,
    keyOf: candidate => candidate.imdbId,
    fetchLabels: fetchBatch,
    apply: async (candidate, title, stats) =>
      applyCandidateTitle({database, candidate, title, dryRun, stats}),
  });
}

async function applyCandidateTitle({
  database,
  candidate,
  title,
  dryRun,
  stats,
}: {
  database: ReturnType<typeof getDatabase>;
  candidate: Candidate;
  title: string | undefined;
  dryRun: boolean;
  stats: WikidataImportStats;
}): Promise<void> {
  if (!title) {
    stats.notFound++;
    return;
  }

  if (
    candidate.existingJa !== undefined &&
    isSameTitle(title, candidate.existingJa)
  ) {
    return;
  }

  const isReplacement = candidate.existingJa !== undefined;
  console.log(
    `  ${candidate.imdbId}: ${isReplacement ? `${candidate.existingJa} -> ` : ''}${title}`,
  );

  if (isReplacement) {
    stats.replaced++;
  } else {
    stats.saved++;
  }

  if (dryRun) {
    return;
  }

  await saveJapaneseTitle(database, candidate, title);
}

async function saveJapaneseTitle(
  database: ReturnType<typeof getDatabase>,
  candidate: Candidate,
  title: string,
): Promise<void> {
  if (candidate.existingJa === undefined) {
    await database
      .insert(translations)
      .values({
        resourceType: 'movie_title',
        resourceUid: candidate.uid,
        languageCode: 'ja',
        content: title,
        isDefault: 0,
      })
      .onConflictDoNothing();
    return;
  }

  await database
    .update(translations)
    .set({content: title})
    .where(
      and(
        eq(translations.resourceUid, candidate.uid),
        eq(translations.resourceType, 'movie_title'),
        eq(translations.languageCode, 'ja'),
      ),
    );
}
