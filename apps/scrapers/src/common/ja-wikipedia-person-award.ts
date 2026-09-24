import {type Environment} from '@shine/database';
import {
  importImdbEventAward,
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
  type ImdbEventNomination,
  type ImdbEventNominationTitle,
} from '../imdb-event-award';
import {addImportStats, emptyImportStats} from '../imdb-event-award/stats';
import {
  filmReferenceKey,
  resolveFilmReferences,
} from './film-reference-resolver';
import {type FilmReference, type YearWindow} from './film-resolution-checks';
import {type ResolvedFilm} from './wikidata-film-resolver';
import {
  parseListPersonAwardWikitext,
  type ListPersonAwardCategory,
  type ListPersonAwardEdition,
  type ListPersonAwardFilm,
} from './ja-wikipedia-person-award-wikitext';
import {fetchWikitext} from './wikitext';

export {
  parseListPersonAwardWikitext,
  type ListPersonAwardCategory,
  type ListPersonAwardEdition,
  type ListPersonAwardEntry,
  type ListPersonAwardFilm,
  type ListPersonAwardPerson,
} from './ja-wikipedia-person-award-wikitext';

export type ListPersonAwardSource = {
  /** CLIの --award で指定する名前 */
  key: string;
  /** 日本語版Wikipediaの記事名 */
  article: string;
  organizationName: string;
  establishedYear: number;
  ceremonyNumber: (year: number) => number | undefined;
  categories: ListPersonAwardCategory[];
  /** `年度:題名` → IMDb ID。記事名から引けない作品を直接指す */
  resolutionOverrides?: ReadonlyMap<string, string>;
  /** 記事の表記 → TMDbのクレジット名。芸名を使い分けている人だけ */
  personNameAliases?: Readonly<Record<string, string>>;
};

/** 日本映画は年度＝公開年。映画祭プレミアで前年、年始公開で翌年になることはある */
const JAPANESE_PUBLICATION_WINDOW: YearWindow = {min: -1, max: 1};

/** 外国映画は本国公開の後に日本公開されるので年度より前になる */
const FOREIGN_PUBLICATION_WINDOW: YearWindow = {min: -Infinity, max: 1};

/** 同じ記事（原作記事など）が別の年度に現れたら別の映画なので、年度ごとに同定する */
function overrideImdbId(
  source: ListPersonAwardSource,
  year: number,
  film: ListPersonAwardFilm,
): string | undefined {
  return source.resolutionOverrides?.get(`${year}:${film.title}`);
}

function isForeign(source: ListPersonAwardSource, category: string): boolean {
  return source.categories.some(
    definition => definition.category === category && definition.foreign,
  );
}

export function listPersonAwardFilmReferences(
  source: ListPersonAwardSource,
  editions: ListPersonAwardEdition[],
): FilmReference[] {
  const references = new Map<string, FilmReference>();

  for (const edition of editions) {
    for (const entry of edition.entries) {
      const isForeignFilm = isForeign(source, entry.category);
      for (const film of entry.films) {
        addReference(references, source, edition.year, film, isForeignFilm);
      }
    }
  }

  return references.values().toArray();
}

function addReference(
  references: Map<string, FilmReference>,
  source: ListPersonAwardSource,
  year: number,
  film: ListPersonAwardFilm,
  isForeignFilm: boolean,
): void {
  const key = filmReferenceKey(film, year);
  if (references.has(key) || overrideImdbId(source, year, film) !== undefined) {
    return;
  }

  references.set(key, {
    key,
    title: film.title,
    targetYear: year,
    yearWindow: isForeignFilm
      ? FOREIGN_PUBLICATION_WINDOW
      : JAPANESE_PUBLICATION_WINDOW,
    foreign: isForeignFilm,
  });
}

function resolveTitles(
  source: ListPersonAwardSource,
  year: number,
  films: ListPersonAwardFilm[],
  resolved: Map<string, ResolvedFilm>,
): ImdbEventNominationTitle[] {
  const titles: ImdbEventNominationTitle[] = [];
  const seen = new Set<string>();

  for (const film of films) {
    const imdbId = overrideImdbId(source, year, film);
    const match: ResolvedFilm | undefined =
      imdbId === undefined
        ? resolved.get(filmReferenceKey(film, year))
        : {imdbId};
    if (!match) {
      console.log(`Unresolved: ${year} ${film.title}`);
      continue;
    }

    if (seen.has(match.imdbId)) {
      continue;
    }

    seen.add(match.imdbId);
    titles.push({
      imdbId: match.imdbId,
      title: film.title,
      originalTitle: match.englishTitle ?? null,
    });
  }

  return titles;
}

function buildNominations(
  source: ListPersonAwardSource,
  category: ListPersonAwardCategory,
  edition: ListPersonAwardEdition,
  resolved: Map<string, ResolvedFilm>,
): ImdbEventNomination[] {
  const nominations: ImdbEventNomination[] = [];

  for (const entry of edition.entries) {
    if (entry.category !== category.category) {
      continue;
    }

    const titles = resolveTitles(source, edition.year, entry.films, resolved);
    if (titles.length === 0) {
      continue;
    }

    nominations.push({
      isWinner: entry.isWinner ?? true,
      notes: null,
      titles,
      people: entry.people.map(person => ({
        name: source.personNameAliases?.[person.name] ?? person.name,
      })),
    });
  }

  return nominations;
}

export function toImdbEventData(
  source: ListPersonAwardSource,
  category: ListPersonAwardCategory,
  editions: ListPersonAwardEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt = new Date().toISOString().slice(0, 10),
): ImdbEventCollectedData {
  return {
    collectedAt,
    source: `https://ja.wikipedia.org/wiki/${source.article}`,
    editions: editions
      .map(edition => ({
        year: edition.year,
        awardNames: [category.category],
        targetAward: [
          {
            categories: [
              {
                category: category.category,
                total: null,
                nominations: buildNominations(
                  source,
                  category,
                  edition,
                  resolved,
                ),
              },
            ],
          },
        ],
      }))
      .filter(
        edition => edition.targetAward[0].categories[0].nominations.length > 0,
      ),
  };
}

export function listPersonAwardConfig(
  source: ListPersonAwardSource,
  category: ListPersonAwardCategory,
): ImdbEventAwardConfig {
  return {
    organizationName: source.organizationName,
    organizationCountry: 'Japan',
    establishedYear: source.establishedYear,
    categoryName: category.category,
    ceremonyNumber: source.ceremonyNumber,
    isCompetitionCategory: name => name === category.category,
    minimumFilmsPerEdition: 1,
    personRole: category.role,
  };
}

async function resolveFilms(
  source: ListPersonAwardSource,
  editions: ListPersonAwardEdition[],
  tmdbApiKey: string | undefined,
  throttleMs: number,
): Promise<Map<string, ResolvedFilm>> {
  return resolveFilmReferences({
    references: listPersonAwardFilmReferences(source, editions),
    tmdbApiKey,
    throttleMs,
  });
}

export async function importListPersonAward({
  environment,
  source,
  categories = source.categories,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  source: ListPersonAwardSource;
  categories?: ListPersonAwardCategory[];
  dryRun?: boolean;
  /** 年度（記事の見出しの年） */
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  const wikitext = await fetchWikitext(source.article, {language: 'ja'});
  const editions = parseListPersonAwardWikitext(wikitext, categories).filter(
    edition => year === undefined || edition.year === year,
  );
  console.log(
    `\n=== ${source.article}: parsed ${editions.length} editions from Wikipedia`,
  );

  return importListPersonAwardEditions({
    environment,
    source,
    categories,
    editions,
    dryRun,
    year,
    throttleMs,
  });
}

export async function importListPersonAwardEditions({
  environment,
  source,
  categories = source.categories,
  editions,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  source: ListPersonAwardSource;
  categories?: ListPersonAwardCategory[];
  editions: ListPersonAwardEdition[];
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  const resolved = await resolveFilms(
    source,
    editions,
    environment.TMDB_API_KEY,
    throttleMs,
  );

  const total = emptyImportStats();
  const seen = new Set<string>();
  for (const category of categories) {
    if (seen.has(category.category)) {
      continue;
    }

    seen.add(category.category);
    console.log(`\n=== ${source.organizationName}: ${category.category}`);
    const stats = await importImdbEventAward({
      environment,
      data: toImdbEventData(source, category, editions, resolved),
      config: listPersonAwardConfig(source, category),
      dryRun,
      year,
      throttleMs,
    });

    addImportStats(total, stats);
  }

  return total;
}
