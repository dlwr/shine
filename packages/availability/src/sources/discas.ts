import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import {matchesTitle, matchesTitleAsVolume} from '../title-match';
import type {FetchLike, SourceCheckResult} from '../types';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function encodeShiftJisQuery(text: string): string {
  const bytes = iconv.encode(text, 'shift_jis');
  let encoded = '';
  for (const byte of bytes) {
    encoded += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }

  return encoded;
}

export type DiscasSearchResult = {
  title: string;
  detailUrl: string;
};

export function parseDiscasResults(html: string): DiscasSearchResult[] {
  const $ = cheerio.load(html);
  return $('a[href*="goodsDetail.do"]')
    .map((_, element) => ({
      title: $(element).text().trim(),
      detailUrl: $(element).attr('href') ?? '',
    }))
    .get()
    .filter(result => result.title !== '' && result.detailUrl !== '');
}

export function parseDiscasTitles(html: string): string[] {
  return parseDiscasResults(html).map(result => result.title);
}

const productionYearPattern = /製作年[\s\S]{0,50}?(\d{4})\s*年/;

export function parseDiscasProductionYear(html: string): number | undefined {
  const match = productionYearPattern.exec(cheerio.load(html).root().text());
  return match ? Number(match[1]) : undefined;
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  absorb(response: Response): void {
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair] = setCookie.split(';', 1);
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex > 0) {
        this.cookies.set(
          pair.slice(0, separatorIndex).trim(),
          pair.slice(separatorIndex + 1).trim(),
        );
      }
    }
  }

  header(): string {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

const MAX_REDIRECTS = 5;

async function fetchWithSession(
  url: string,
  jar: CookieJar,
  fetchImpl: FetchLike,
): Promise<Response> {
  let currentUrl = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetchImpl(currentUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        Cookie: jar.header(),
        Referer: 'https://movie-tsutaya.tsite.jp/netdvd/dvd/top.do',
      },
      redirect: 'manual',
    });
    jar.absorb(response);

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    return response;
  }

  throw new Error(`Too many redirects for ${url}`);
}

const MAX_VOLUME_LOOKUPS = 3;

async function findMatchingVolume(
  results: DiscasSearchResult[],
  targetTitles: string[],
  year: number | undefined,
  jar: CookieJar,
  fetchImpl: FetchLike,
): Promise<DiscasSearchResult | undefined> {
  const candidates = results
    .filter(result => matchesTitleAsVolume(result.title, targetTitles))
    .slice(0, MAX_VOLUME_LOOKUPS);

  for (const candidate of candidates) {
    const response = await fetchWithSession(
      candidate.detailUrl,
      jar,
      fetchImpl,
    );
    if (!response.ok) {
      continue;
    }

    const productionYear = parseDiscasProductionYear(
      new TextDecoder('shift_jis').decode(await response.arrayBuffer()),
    );
    if (year && productionYear && productionYear !== year) {
      continue;
    }

    return candidate;
  }

  return undefined;
}

export async function checkDiscas(
  targetTitles: string[],
  fetchImpl: FetchLike = fetch,
  options: {year?: number} = {},
): Promise<SourceCheckResult> {
  const query = targetTitles.find(title => title.trim() !== '');
  if (!query) {
    return {source: 'discas', status: 'error', detail: 'No title to search'};
  }

  try {
    const jar = new CookieJar();
    await fetchWithSession(
      'https://movie-tsutaya.tsite.jp/netdvd/dvd/top.do',
      jar,
      fetchImpl,
    );
    const url = `https://movie-tsutaya.tsite.jp/netdvd/dvd/searchDvdBd.do?k=${encodeShiftJisQuery(query)}`;
    const response = await fetchWithSession(url, jar, fetchImpl);
    // DISCASは検索結果0件のとき404を返す
    if (response.status === 404) {
      return {
        source: 'discas',
        status: 'ng',
        detail: 'No results (HTTP 404)',
      };
    }

    if (!response.ok) {
      return {
        source: 'discas',
        status: 'error',
        detail: `HTTP ${response.status}`,
      };
    }

    const html = new TextDecoder('shift_jis').decode(
      await response.arrayBuffer(),
    );
    const results = parseDiscasResults(html);
    const matched = results.find(result =>
      matchesTitle(result.title, targetTitles),
    );
    if (matched) {
      return {
        source: 'discas',
        status: 'ok',
        detail: `Matched: ${matched.title}`,
      };
    }

    const volume = await findMatchingVolume(
      results,
      targetTitles,
      options.year,
      jar,
      fetchImpl,
    );

    return volume
      ? {
          source: 'discas',
          status: 'ok',
          detail: `Matched volume: ${volume.title}`,
        }
      : {
          source: 'discas',
          status: 'ng',
          detail: `No match in ${results.length} results`,
        };
  } catch (error) {
    return {
      source: 'discas',
      status: 'error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
