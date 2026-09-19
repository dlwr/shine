import {buildUrl, fetchJsonWithRetry} from '@shine/utils/fetch';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const USER_AGENT = 'shine-film.com movie database (https://shine-film.com)';
const BATCH_SIZE = 50;
/** claims を含む応答は1件で数百KBになるので、まとめすぎるとタイムアウトする */
const WIKIDATA_BATCH_SIZE = 10;
const WIKIDATA_TIMEOUT_MS = 60_000;
const IMDB_ID_PATTERN = /^tt\d+$/;

export type ResolvedFilm = {
  imdbId: string;
  englishTitle?: string;
  publicationYear?: number;
};

type WikipediaPagePropertiesResponse = {
  query?: {
    normalized?: Array<{from: string; to: string}>;
    redirects?: Array<{from: string; to: string}>;
    pages?: Record<
      string,
      {title?: string; pageprops?: {wikibase_item?: string}}
    >;
  };
};

type WikidataClaims = Record<
  string,
  Array<{mainsnak?: {datavalue?: {value?: unknown}}}>
>;

type WikidataEntitiesResponse = {
  entities?: Record<
    string,
    {
      claims?: WikidataClaims;
      labels?: Record<string, {value?: string}>;
    }
  >;
};

export type WikipediaLanguage = 'ja' | 'en';

function wikipediaApi(language: WikipediaLanguage): string {
  return `https://${language}.wikipedia.org/w/api.php`;
}

async function fetchWikibaseItems(
  pages: string[],
  language: WikipediaLanguage,
): Promise<Map<string, string>> {
  const url = buildUrl(wikipediaApi(language), {
    action: 'query',
    prop: 'pageprops',
    ppprop: 'wikibase_item',
    redirects: '1',
    format: 'json',
    titles: pages.join('|'),
  });

  const response = await fetchJsonWithRetry<WikipediaPagePropertiesResponse>(
    url,
    {
      headers: {'User-Agent': USER_AGENT},
    },
  );

  const normalized = new Map(
    (response.query?.normalized ?? []).map(entry => [entry.from, entry.to]),
  );
  const redirects = new Map(
    (response.query?.redirects ?? []).map(entry => [entry.from, entry.to]),
  );
  const byTitle = new Map(
    Object.values(response.query?.pages ?? {}).map(page => [page.title, page]),
  );

  const items = new Map<string, string>();
  for (const page of pages) {
    const title = normalized.get(page) ?? page;
    const resolvedTitle = redirects.get(title) ?? title;
    const item = byTitle.get(resolvedTitle)?.pageprops?.wikibase_item;
    if (item) {
      items.set(page, item);
    }
  }

  return items;
}

async function fetchImdbIds(
  itemIds: string[],
): Promise<Map<string, ResolvedFilm>> {
  const url = buildUrl(WIKIDATA_API, {
    action: 'wbgetentities',
    props: 'claims|labels',
    languages: 'en',
    format: 'json',
    ids: itemIds.join('|'),
  });

  const response = await fetchJsonWithRetry<WikidataEntitiesResponse>(
    url,
    {headers: {'User-Agent': USER_AGENT}},
    3,
    1000,
    WIKIDATA_TIMEOUT_MS,
  );

  const films = new Map<string, ResolvedFilm>();
  const entityEntries = Object.entries(response.entities ?? {});
  for (const [itemId, entity] of entityEntries) {
    const imdbId = entity.claims?.P345?.[0]?.mainsnak?.datavalue?.value;
    if (typeof imdbId !== 'string' || !IMDB_ID_PATTERN.test(imdbId)) {
      continue;
    }

    films.set(itemId, {
      imdbId,
      englishTitle: entity.labels?.en?.value,
      publicationYear: publicationYearFromClaims(entity.claims),
    });
  }

  return films;
}

/** WikidataのP577（publication date）から最も早い公開年を取り出す */
export function publicationYearFromClaims(
  claims: WikidataClaims | undefined,
): number | undefined {
  const years = (claims?.P577 ?? [])
    .map(claim => {
      const value = claim.mainsnak?.datavalue?.value;
      if (typeof value !== 'object' || value === null || !('time' in value)) {
        return;
      }

      const {time} = value as {time?: unknown};
      if (typeof time !== 'string') {
        return;
      }

      const year = /^\+(\d{4})/.exec(time)?.[1];
      return year === undefined ? undefined : Number(year);
    })
    .filter((year): year is number => year !== undefined);

  return years.length > 0 ? Math.min(...years) : undefined;
}

export async function resolveFilmsByWikipediaPage(
  pages: string[],
  {language = 'ja'}: {language?: WikipediaLanguage} = {},
): Promise<Map<string, ResolvedFilm>> {
  const itemsByPage = new Map<string, string>();
  for (let index = 0; index < pages.length; index += BATCH_SIZE) {
    const batch = pages.slice(index, index + BATCH_SIZE);
    const wikibaseItems = await fetchWikibaseItems(batch, language);
    for (const [page, item] of wikibaseItems) {
      itemsByPage.set(page, item);
    }

    console.log(
      `  Wikipedia: ${Math.min(index + BATCH_SIZE, pages.length)}/${pages.length}`,
    );
  }

  const itemIds = [...new Set(itemsByPage.values())];
  const filmsByItem = new Map<string, ResolvedFilm>();
  for (let index = 0; index < itemIds.length; index += WIKIDATA_BATCH_SIZE) {
    const batch = itemIds.slice(index, index + WIKIDATA_BATCH_SIZE);
    const imdbIds = await fetchImdbIds(batch);
    for (const [item, film] of imdbIds) {
      filmsByItem.set(item, film);
    }

    console.log(
      `  Wikidata: ${Math.min(index + WIKIDATA_BATCH_SIZE, itemIds.length)}/${itemIds.length}`,
    );
  }

  const resolved = new Map<string, ResolvedFilm>();
  for (const [page, item] of itemsByPage) {
    const film = filmsByItem.get(item);
    if (film) {
      resolved.set(page, film);
    }
  }

  return resolved;
}
