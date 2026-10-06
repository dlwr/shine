import {setTimeout as sleep} from 'node:timers/promises';
import {fetchJsonWithRetry} from '@shine/utils/fetch';

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'shine-film.com movie database (https://shine-film.com)';
export const DEFAULT_BATCH_SIZE = 50;

export type WikidataJapaneseLabelImportStats = {
  candidates: number;
  saved: number;
  replaced: number;
  notFound: number;
  failed: number;
};

export type JapaneseLabelBinding = {
  jaLabel?: {value?: string};
  article?: {value?: string};
};

export function buildJapaneseLabelQuery({
  variable,
  property,
  values,
}: {
  variable: string;
  property: string;
  values: string[];
}): string {
  return `SELECT ?${variable} ?jaLabel ?article WHERE {
  VALUES ?${variable} { ${values.map(value => `"${value}"`).join(' ')} }
  ?item wdt:${property} ?${variable}.
  OPTIONAL {
    ?item rdfs:label ?jaLabel.
    FILTER(LANG(?jaLabel) = "ja")
  }
  OPTIONAL {
    ?article schema:about ?item;
      schema:isPartOf <https://ja.wikipedia.org/>.
  }
}`;
}

export function articleTitleFromUrl(
  url: string | undefined,
): string | undefined {
  if (!url) {
    return undefined;
  }

  const encoded = url.split('/wiki/').pop();
  if (!encoded) {
    return undefined;
  }

  try {
    return decodeURIComponent(encoded).replaceAll('_', ' ');
  } catch {
    return undefined;
  }
}

export async function fetchSparql<T>(query: string): Promise<T> {
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;

  return fetchJsonWithRetry<T>(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/sparql-results+json',
    },
  });
}

export async function importJapaneseLabelsInBatches<Candidate, Key>({
  candidates,
  subject,
  emptyMessage,
  dryRun,
  batchSize,
  throttleMs,
  keyOf,
  fetchLabels,
  apply,
}: {
  candidates: Candidate[];
  subject: string;
  emptyMessage: string;
  dryRun: boolean;
  batchSize: number;
  throttleMs: number;
  keyOf: (candidate: Candidate) => Key;
  fetchLabels: (keys: Key[]) => Promise<Map<Key, string>>;
  apply: (
    candidate: Candidate,
    label: string | undefined,
    stats: WikidataJapaneseLabelImportStats,
  ) => Promise<void>;
}): Promise<WikidataJapaneseLabelImportStats> {
  const stats: WikidataJapaneseLabelImportStats = {
    candidates: candidates.length,
    saved: 0,
    replaced: 0,
    notFound: 0,
    failed: 0,
  };

  if (candidates.length === 0) {
    console.log(emptyMessage);
    return stats;
  }

  const batches = Math.ceil(candidates.length / batchSize);
  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Looking up ${candidates.length} ${subject} on Wikidata (${batches} batches)...`,
  );

  for (let index = 0; index < candidates.length; index += batchSize) {
    const batch = candidates.slice(index, index + batchSize);
    const batchNumber = Math.floor(index / batchSize) + 1;

    let labels: Map<Key, string>;
    try {
      labels = await fetchLabels(batch.map(candidate => keyOf(candidate)));
    } catch (error) {
      console.error(`  Batch ${batchNumber}/${batches} failed:`, error);
      stats.failed += batch.length;
      continue;
    }

    for (const candidate of batch) {
      await apply(candidate, labels.get(keyOf(candidate)), stats);
    }

    console.log(`  Batch ${batchNumber}/${batches} done`);

    if (throttleMs > 0 && index + batchSize < candidates.length) {
      await sleep(throttleMs);
    }
  }

  console.log('\nWikidata import summary:');
  console.log(`  Candidates: ${stats.candidates}`);
  console.log(`  Saved (new): ${stats.saved}`);
  console.log(`  Replaced (was romanized): ${stats.replaced}`);
  console.log(`  Not on Wikidata: ${stats.notFound}`);
  console.log(`  Failed: ${stats.failed}`);

  return stats;
}
