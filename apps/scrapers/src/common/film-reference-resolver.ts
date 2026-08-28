import {resolveRemainingByTmdb} from './tmdb-film-resolver';
import {
  dropDuplicateResolutions,
  dropMisattributedResolutions,
  resolveFilmsByWikipediaPage,
  type FilmReference,
  type ResolvedFilm,
} from './wikidata-film-resolver';

const TITLE_PREFIX = 'title:';
const YEAR_SUFFIX = /@\d{4}$/;

/** 同じ記事が別の年に現れる連作を年ごとに同定するため、参照は記事名と年で引く */
export function filmReferenceKey(
  film: {page?: string; title: string},
  year: number,
): string {
  return `${film.page ?? `${TITLE_PREFIX}${film.title}`}@${year}`;
}

export async function resolveFilmReferences({
  references,
  tmdbApiKey,
  throttleMs,
  resolvePages = resolveFilmsByWikipediaPage,
  fetchReleaseYear,
}: {
  references: FilmReference[];
  tmdbApiKey: string | undefined;
  throttleMs: number;
  resolvePages?: (pages: string[]) => Promise<Map<string, ResolvedFilm>>;
  fetchReleaseYear?: (imdbId: string) => Promise<number | undefined>;
}): Promise<Map<string, ResolvedFilm>> {
  const pageByKey = new Map(
    references
      .filter(reference => !reference.key.startsWith(TITLE_PREFIX))
      .map(reference => [
        reference.key,
        reference.key.replace(YEAR_SUFFIX, ''),
      ]),
  );
  const pages = [...new Set(pageByKey.values())];

  const resolved = new Map<string, ResolvedFilm>();
  if (pages.length > 0) {
    console.log(`Resolving IMDb IDs for ${pages.length} articles...`);
    const byPage = await resolvePages(pages);
    console.log(`Resolved ${byPage.size}/${pages.length} articles`);

    for (const [key, page] of pageByKey) {
      const film = byPage.get(page);
      if (film) {
        resolved.set(key, {...film});
      }
    }
  }

  const dropped = await dropMisattributedResolutions({
    references,
    resolved,
    tmdbApiKey,
    throttleMs,
    fetchReleaseYear,
  });
  if (dropped > 0) {
    console.log(`Dropped ${dropped} misattributed resolutions`);
  }

  await resolveRemainingByTmdb({references, resolved, tmdbApiKey, throttleMs});

  const duplicates = dropDuplicateResolutions(references, resolved);
  if (duplicates > 0) {
    console.log(`Dropped ${duplicates} duplicate resolutions`);
  }

  return resolved;
}
