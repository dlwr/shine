import {hasJapaneseText} from '@shine/availability';
import {type Environment} from '@shine/database';
import {
  importImdbEventAward,
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
  type ImdbEventNomination,
} from '../imdb-event-award';
import {backfillJapaneseTitlesByImdbId} from './japanese-title-backfill';
import {resolveRemainingByTmdb} from './tmdb-film-resolver';
import {
  dropDuplicateResolutions,
  dropMisattributedResolutions,
  reportDuplicateResolutions,
  resolveFilmsByWikipediaPage,
  type FilmReference,
  type ResolvedFilm,
  type YearWindow,
} from './wikidata-film-resolver';
import {fetchWikitext} from './wikitext';

export type WikiFilm = {
  page?: string;
  title: string;
};

export type FilmAwardCategory<Edition, Film extends WikiFilm> = {
  category: string;
  films: (edition: Edition) => Film[];
  /** 外国映画が対象の部門。日本公開が本国より遅れるので同定の年の窓を広げる */
  foreign?: boolean;
  /** 省略すると全作品を受賞として取り込む */
  nomination?: (film: Film) => {isWinner: boolean; notes: string | null};
};

export type FilmAwardSource<
  Edition extends {year: number},
  Film extends WikiFilm = WikiFilm,
> = {
  /** 日本語版Wikipediaの記事名 */
  article: string;
  organizationName: string;
  establishedYear: number;
  ceremonyNumber: (year: number) => number | undefined;
  categories: Array<FilmAwardCategory<Edition, Film>>;
  /** `年度:題名` → IMDb ID。記事名から引けない作品を直接指す */
  resolutionOverrides?: ReadonlyMap<string, string>;
  useNotesAsSpecialMention?: boolean;
  /** ベストテンは同じ映画が複数の年に出ることがあるので、重複を落とさず報告だけにする */
  keepDuplicateResolutions?: boolean;
  logUnresolved?: boolean;
};

const HIGHER_HEADING = /^={2,3}[^=]/m;
const AWARD_LINE = /^\*(?!\*)\s*([^『\s]+)\s*(.*)$/;
// 出典のタイトルに『映画名』が入ることがある
const REF_TAG = /<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>/g;
const TEMPLATE = /{{[^}]*}}/g;
const BRACKETED_TITLE = /『([^』]*)』/g;
const WIKI_LINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;

/** 日本映画は選考年度＝公開年。年末公開が翌年扱いになることはある */
const JAPANESE_PUBLICATION_WINDOW: YearWindow = {min: -1, max: 1};

/** 外国映画は本国公開の後に日本公開されるので選考年度より前になる */
const FOREIGN_PUBLICATION_WINDOW: YearWindow = {min: -Infinity, max: 1};

export type EditionSection = {
  ceremonyNumber: number;
  year: number;
  body: string;
};

/** 見出しは (回次, 年) の2つのグループを持つこと */
export function splitEditions(
  wikitext: string,
  editionHeading: RegExp,
): EditionSection[] {
  const parts = wikitext.split(new RegExp(editionHeading.source, 'gm'));
  const editions: EditionSection[] = [];

  for (let index = 1; index < parts.length; index += 3) {
    editions.push({
      ceremonyNumber: Number(parts[index]),
      year: Number(parts[index + 1]),
      body: parts[index + 2].split(HIGHER_HEADING)[0],
    });
  }

  return editions;
}

function parseFilm(content: string): WikiFilm {
  const link = WIKI_LINK.exec(content);
  if (link) {
    const page = link[1].trim();
    return {page, title: (link[2] ?? page).trim()};
  }

  return {title: content.replaceAll(TEMPLATE, '').trim()};
}

export function parseBracketedFilms(text: string): WikiFilm[] {
  const films: WikiFilm[] = [];

  for (const [, inner] of text.matchAll(BRACKETED_TITLE)) {
    const content = inner.trim();
    if (content === '') {
      continue;
    }

    films.push(parseFilm(content));
  }

  if (films.length === 0 && WIKI_LINK.test(text)) {
    films.push(parseFilm(text));
  }

  return films;
}

/** `*賞名 『作品』` の行を賞名で振り分けて作品を集める */
export function collectAwardLineFilms(
  body: string,
  target: (name: string) => WikiFilm[] | undefined,
): void {
  for (const line of body.split('\n')) {
    const matched = AWARD_LINE.exec(line.replaceAll(REF_TAG, '').trim());
    if (!matched) {
      continue;
    }

    const [, name, rest] = matched;
    target(name)?.push(...parseBracketedFilms(rest));
  }
}

/** 記事が無い作品はWikipediaの表示名で引けるようにする */
export function filmKey(film: WikiFilm): string {
  return film.page ?? `title:${film.title}`;
}

function overrideImdbId<Edition extends {year: number}, Film extends WikiFilm>(
  source: FilmAwardSource<Edition, Film>,
  year: number,
  film: Film,
): string | undefined {
  return source.resolutionOverrides?.get(`${year}:${film.title}`);
}

function filmsOf<Edition extends {year: number}, Film extends WikiFilm>(
  source: FilmAwardSource<Edition, Film>,
  edition: Edition,
): Array<{film: Film; category: FilmAwardCategory<Edition, Film>}> {
  return source.categories.flatMap(category =>
    category.films(edition).map(film => ({film, category})),
  );
}

export function filmAwardReferences<
  Edition extends {year: number},
  Film extends WikiFilm,
>(
  source: FilmAwardSource<Edition, Film>,
  editions: Edition[],
): FilmReference[] {
  return editions.flatMap(edition =>
    filmsOf(source, edition)
      .filter(
        ({film}) => overrideImdbId(source, edition.year, film) === undefined,
      )
      .map(({film, category}) => ({
        key: filmKey(film),
        title: film.title,
        targetYear: edition.year,
        yearWindow: category.foreign
          ? FOREIGN_PUBLICATION_WINDOW
          : JAPANESE_PUBLICATION_WINDOW,
        foreign: category.foreign === true,
      })),
  );
}

function buildNominations<
  Edition extends {year: number},
  Film extends WikiFilm,
>(
  source: FilmAwardSource<Edition, Film>,
  edition: Edition,
  category: FilmAwardCategory<Edition, Film>,
  resolved: Map<string, ResolvedFilm>,
): ImdbEventNomination[] {
  const nominations: ImdbEventNomination[] = [];
  const seen = new Set<string>();

  for (const film of category.films(edition)) {
    const imdbId = overrideImdbId(source, edition.year, film);
    const match: ResolvedFilm | undefined =
      imdbId === undefined ? resolved.get(filmKey(film)) : {imdbId};
    if (!match || seen.has(match.imdbId)) {
      continue;
    }

    seen.add(match.imdbId);
    const {isWinner, notes} = category.nomination?.(film) ?? {
      isWinner: true,
      notes: null,
    };
    nominations.push({
      isWinner,
      notes,
      titles: [
        {
          imdbId: match.imdbId,
          title: film.title,
          originalTitle: match.englishTitle ?? null,
        },
      ],
    });
  }

  return nominations;
}

export function toFilmAwardEventData<
  Edition extends {year: number},
  Film extends WikiFilm,
>(
  source: FilmAwardSource<Edition, Film>,
  editions: Edition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt = new Date().toISOString().slice(0, 10),
): ImdbEventCollectedData {
  return {
    collectedAt,
    source: `https://ja.wikipedia.org/wiki/${source.article.replaceAll(' ', '_')}`,
    editions: editions
      .map(edition => ({
        year: edition.year,
        awardNames: source.categories.map(category => category.category),
        targetAward: [
          {
            categories: source.categories.map(category => ({
              category: category.category,
              total: null,
              nominations: buildNominations(
                source,
                edition,
                category,
                resolved,
              ),
            })),
          },
        ],
      }))
      .filter(edition =>
        edition.targetAward[0].categories.some(
          category => category.nominations.length > 0,
        ),
      ),
  };
}

export function filmAwardConfig<
  Edition extends {year: number},
  Film extends WikiFilm,
>(
  source: FilmAwardSource<Edition, Film>,
  categoryName: string,
): ImdbEventAwardConfig {
  if (source.categories.every(entry => entry.category !== categoryName)) {
    throw new Error(`${source.article}に部門「${categoryName}」は無い`);
  }

  return {
    organizationName: source.organizationName,
    organizationCountry: 'Japan',
    establishedYear: source.establishedYear,
    ceremonyNumber: source.ceremonyNumber,
    categoryName,
    isCompetitionCategory: category => category === categoryName,
    minimumFilmsPerEdition: 1,
    useNotesAsSpecialMention: source.useNotesAsSpecialMention,
  };
}

export function collectJapaneseTitles<
  Edition extends {year: number},
  Film extends WikiFilm,
>(
  source: FilmAwardSource<Edition, Film>,
  editions: Edition[],
  resolved: Map<string, ResolvedFilm>,
): Map<string, string> {
  const titleByImdbId = new Map<string, string>();

  for (const edition of editions) {
    for (const {film} of filmsOf(source, edition)) {
      const imdbId =
        overrideImdbId(source, edition.year, film) ??
        resolved.get(filmKey(film))?.imdbId;
      if (
        imdbId !== undefined &&
        hasJapaneseText(film.title) &&
        !titleByImdbId.has(imdbId)
      ) {
        titleByImdbId.set(imdbId, film.title);
      }
    }
  }

  return titleByImdbId;
}

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

export async function resolveFilmAwardEditions<
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
