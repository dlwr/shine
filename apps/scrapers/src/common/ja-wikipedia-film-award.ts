import {type Environment} from '@shine/database';
import {
  importImdbEventAward,
  type ImdbEventImportStats,
} from '../imdb-event-award';
import {backfillJapaneseTitlesByImdbId} from './japanese-title-backfill';
import {resolveRemainingByTmdb} from './tmdb-film-resolver';
import {
  dropDuplicateResolutions,
  dropMisattributedResolutions,
  reportDuplicateResolutions,
} from './film-resolution-checks';
import {
  resolveFilmsByWikipediaPage,
  type ResolvedFilm,
} from './wikidata-film-resolver';
import {fetchWikitext} from './wikitext';
import {
  collectJapaneseTitles,
  filmAwardConfig,
  filmAwardReferences,
  filmsOf,
  toFilmAwardEventData,
  type FilmAwardSource,
} from './ja-wikipedia-film-award-source';
import {type WikiFilm} from './ja-wikipedia-film-award-wikitext';

export async function backfillFilmAwardJapaneseTitles<
  Edition extends {year: number},
  Film extends WikiFilm,
>({
  source,
  environment,
  editions,
  resolved,
}: {
  source: FilmAwardSource<Edition, Film>;
  environment: Environment;
  editions: Edition[];
  resolved: Map<string, ResolvedFilm>;
}): Promise<{saved: number; replaced: number}> {
  return backfillJapaneseTitlesByImdbId(
    environment,
    collectJapaneseTitles(source, editions, resolved),
  );
}

async function resolveFilmAwardEditions<
  Edition extends {year: number},
  Film extends WikiFilm,
>({
  source,
  editions,
  tmdbApiKey,
  throttleMs,
}: {
  source: FilmAwardSource<Edition, Film>;
  editions: Edition[];
  tmdbApiKey: string | undefined;
  throttleMs: number;
}): Promise<Map<string, ResolvedFilm>> {
  const pages = [
    ...new Set(
      editions
        .flatMap(edition => filmsOf(source, edition))
        .map(({film}) => film.page)
        .filter((page): page is string => page !== undefined),
    ),
  ];

  console.log(`Resolving IMDb IDs for ${pages.length} articles...`);
  const resolved = await resolveFilmsByWikipediaPage(pages);
  console.log(`Resolved ${resolved.size}/${pages.length} articles`);

  const references = filmAwardReferences(source, editions);
  const misattributed = await dropMisattributedResolutions({
    references,
    resolved,
    tmdbApiKey,
    throttleMs,
  });
  if (misattributed > 0) {
    console.log(`Dropped ${misattributed} misattributed resolutions`);
  }

  // 同じ映画が複数の年度・部門に選ばれることは無いので、重複はリメイクなどへの誤解決
  if (source.keepDuplicateResolutions) {
    reportDuplicateResolutions(references, resolved);
  } else {
    const duplicates = dropDuplicateResolutions(references, resolved);
    if (duplicates > 0) {
      console.log(`Dropped ${duplicates} duplicate resolutions`);
    }
  }

  await resolveRemainingByTmdb({references, resolved, tmdbApiKey, throttleMs});

  if (!source.keepDuplicateResolutions) {
    dropDuplicateResolutions(references, resolved);
  }

  if (source.logUnresolved) {
    for (const reference of references) {
      if (!resolved.has(reference.key)) {
        console.log(`  Unresolved: ${reference.targetYear} ${reference.title}`);
      }
    }
  }

  return resolved;
}

export async function importFilmAward<
  Edition extends {year: number},
  Film extends WikiFilm,
>({
  source,
  parse,
  environment,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  source: FilmAwardSource<Edition, Film>;
  parse: (wikitext: string) => Edition[];
  environment: Environment;
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<Record<string, ImdbEventImportStats>> {
  const wikitext = await fetchWikitext(source.article, {language: 'ja'});
  const allEditions = parse(wikitext);
  const editions =
    year === undefined
      ? allEditions
      : allEditions.filter(edition => edition.year === year);

  console.log(`Parsed ${editions.length} editions from Wikipedia`);

  const resolved = await resolveFilmAwardEditions({
    source,
    editions,
    tmdbApiKey: environment.TMDB_API_KEY,
    throttleMs,
  });

  const data = toFilmAwardEventData(source, editions, resolved);
  const stats: Record<string, ImdbEventImportStats> = {};

  for (const {category} of source.categories) {
    stats[category] = await importImdbEventAward({
      environment,
      data,
      config: filmAwardConfig(source, category),
      dryRun,
      year,
      throttleMs,
    });
  }

  if (!dryRun) {
    const titles = await backfillFilmAwardJapaneseTitles({
      source,
      environment,
      editions,
      resolved,
    });
    console.log(
      `\nJapanese titles: ${titles.saved} saved, ${titles.replaced} replaced`,
    );
  }

  return stats;
}
