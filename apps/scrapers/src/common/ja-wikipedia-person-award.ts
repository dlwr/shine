import {type Environment} from '@shine/database';
import {
  importImdbEventAward,
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
  type ImdbEventNomination,
  type ImdbEventNominationTitle,
} from '../imdb-event-award';
import {
  filmReferenceKey,
  resolveFilmReferences,
} from './film-reference-resolver';
import {
  type FilmReference,
  type ResolvedFilm,
  type YearWindow,
} from './wikidata-film-resolver';
import {fetchWikitext} from './wikitext';

export type ListPersonAwardCategory = {
  /** 記事での部門名。改称があれば全て並べる */
  names: string[];
  /** DBに保存する部門名 */
  category: string;
  role: 'director' | 'actor';
  /** 同じ部門名を年によって別部門に振るときの対象年度 */
  years?: number[];
  /** 外国映画が対象の部門。日本公開が本国より遅れるので同定の年の窓を広げる */
  foreign?: boolean;
};

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

export type ListPersonAwardPerson = {
  name: string;
  page?: string;
};

export type ListPersonAwardFilm = {
  page?: string;
  title: string;
};

export type ListPersonAwardEntry = {
  category: string;
  people: ListPersonAwardPerson[];
  films: ListPersonAwardFilm[];
  /** 候補だけの行は false。受賞者しか並ばない記事では省略する */
  isWinner?: boolean;
};

export type ListPersonAwardEdition = {
  year: number;
  ceremonyNumber: number;
  entries: ListPersonAwardEntry[];
};

type Group = Omit<ListPersonAwardEntry, 'category'>;

const EDITION_HEADING =
  /^====\s*(?:\[\[[^\]|]+\|)?第(\d+)回（(\d{4})年度?）(?:]])?\s*====\s*$/gm;
const HIGHER_HEADING = /^={2,3}[^=]/m;
const AWARD_LINE = /^:?(\*+)\s*([^『\s（]+)\s*(.*)$/;
const SUB_ITEM = /^:?(\*+)\s*(.*)$/;
const REF_TAG = /<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>|\{\{R\|[^}]*}}/g;
// 節名に『』を含むリンク（[[学校の怪談 (映画)#『学校の怪談2』|…]]）があるので、『』付きリンクを先に読む
const TOKEN =
  /『\s*\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]\s*』|\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]|『([^』]*)』/g;
const WIKI_LINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;
const INTERWIKI_TEMPLATE = /^\{\{仮リンク\|([^|}]+)/;
const QUOTED_LINK = /『\s*\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]\s*』/g;
const NAME_SEPARATOR = /[、,]/;
const NAME_TRIM = /^[\s（）()：:・]+|[\s（）()：:・]+$/g;
const DISAMBIGUATION = /\s*\([^)]*\)$/;
const NOT_A_NAME = new Set(['ほか', 'など', '他', '等', 'その他']);
const NO_WINNER = '該当者なし';

// 記事は既出の映画を再リンクしないので、同じ回の『』内リンクから記事名を補う
function collectTitlePages(body: string): Map<string, string> {
  const pages = new Map<string, string>();

  for (const link of body.matchAll(QUOTED_LINK)) {
    const page = link[1].trim();
    const title = (link[2] ?? page).trim();
    if (!pages.has(title)) {
      pages.set(title, page);
    }
  }

  return pages;
}

function parseFilm(
  inner: string,
  titlePages: Map<string, string>,
): ListPersonAwardFilm | undefined {
  const content = inner.trim();
  if (content === '') {
    return undefined;
  }

  const link = WIKI_LINK.exec(content);
  if (link) {
    const page = link[1].trim();
    return {page, title: (link[2] ?? page).trim()};
  }

  const template = INTERWIKI_TEMPLATE.exec(content);
  if (template) {
    return {title: template[1].trim()};
  }

  const page = titlePages.get(content);
  return page === undefined ? {title: content} : {page, title: content};
}

function bareNames(text: string): ListPersonAwardPerson[] {
  return text
    .split(NAME_SEPARATOR)
    .map(part => part.replaceAll(NAME_TRIM, ''))
    .filter(name => name !== '' && !NOT_A_NAME.has(name))
    .map(name => ({name}));
}

function linkedPerson(
  page: string,
  label: string | undefined,
): ListPersonAwardPerson {
  return {
    name: (label ?? page.replace(DISAMBIGUATION, '')).trim(),
    page: page.trim(),
  };
}

function parseGroups(text: string, titlePages: Map<string, string>): Group[] {
  const groups: Group[] = [];
  let current: Group | undefined;
  let cursor = 0;

  const addPeople = (people: ListPersonAwardPerson[]) => {
    if (people.length === 0) {
      return;
    }

    if (!current || current.films.length > 0) {
      current = {people: [...people], films: []};
      groups.push(current);
    } else {
      current.people.push(...people);
    }
  };

  for (const token of text.matchAll(TOKEN)) {
    const [, quotedPage, quotedLabel, linkPage, linkLabel, titleInner] = token;
    const between = text.slice(cursor, token.index);
    cursor = token.index + token[0].length;
    addPeople(bareNames(between));

    if (linkPage !== undefined) {
      addPeople([linkedPerson(linkPage, linkLabel)]);
      continue;
    }

    const film =
      quotedPage === undefined
        ? parseFilm(titleInner, titlePages)
        : {page: quotedPage.trim(), title: (quotedLabel ?? quotedPage).trim()};
    if (film && current) {
      current.films.push(film);
    }
  }

  return groups.filter(group => group.films.length > 0);
}

function findCategory(
  categories: ListPersonAwardCategory[],
  name: string,
  year: number,
): ListPersonAwardCategory | undefined {
  return categories.find(
    category =>
      category.names.includes(name) &&
      (category.years === undefined || category.years.includes(year)),
  );
}

function parseEditionBody(
  year: number,
  body: string,
  categories: ListPersonAwardCategory[],
): ListPersonAwardEntry[] {
  const entries: ListPersonAwardEntry[] = [];
  const titlePages = collectTitlePages(body);
  const lines = body
    .split('\n')
    .map(line => line.replaceAll(REF_TAG, '').trim());

  for (const [index, line] of lines.entries()) {
    const matched = AWARD_LINE.exec(line);
    if (!matched) {
      continue;
    }

    const [, marker, name, rest] = matched;
    const definition = findCategory(categories, name, year);
    if (!definition || rest.includes(NO_WINNER)) {
      continue;
    }

    const texts = rest === '' ? subItems(lines, index, marker.length) : [rest];
    for (const text of texts) {
      for (const group of parseGroups(text, titlePages)) {
        entries.push({category: definition.category, ...group});
      }
    }
  }

  return entries;
}

function subItems(lines: string[], index: number, depth: number): string[] {
  const texts: string[] = [];

  const following = lines.slice(index + 1);
  for (const line of following) {
    const matched = SUB_ITEM.exec(line);
    if (!matched || matched[1].length <= depth) {
      break;
    }

    texts.push(matched[2]);
  }

  return texts;
}

export function parseListPersonAwardWikitext(
  wikitext: string,
  categories: ListPersonAwardCategory[],
): ListPersonAwardEdition[] {
  const parts = wikitext.split(EDITION_HEADING);
  const editions: ListPersonAwardEdition[] = [];

  for (let index = 1; index < parts.length; index += 3) {
    const ceremonyNumber = Number(parts[index]);
    const year = Number(parts[index + 1]);
    const body = parts[index + 2].split(HIGHER_HEADING)[0];
    editions.push({
      year,
      ceremonyNumber,
      entries: parseEditionBody(year, body, categories),
    });
  }

  return editions;
}

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
      originalTitle: match.englishTitle ?? null, // eslint-disable-line unicorn/no-null -- ImdbEventNominationTitleの型に合わせる
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
      notes: null, // eslint-disable-line unicorn/no-null -- ImdbEventNominationの型に合わせる
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
                total: null, // eslint-disable-line unicorn/no-null -- ImdbEventEditionの型に合わせる
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

function emptyStats(): ImdbEventImportStats {
  return {
    editionsProcessed: 0,
    moviesCreated: 0,
    moviesExisting: 0,
    skippedSoftDeleted: 0,
    nominationsCreated: 0,
    winnersUpdated: 0,
    tmdbNotFound: 0,
    peopleUnresolved: 0,
    failed: 0,
  };
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

  const total = emptyStats();
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

    for (const key of Object.keys(total) as Array<keyof ImdbEventImportStats>) {
      total[key] += stats[key];
    }
  }

  return total;
}
