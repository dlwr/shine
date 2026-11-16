import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import {
  matchesTitle,
  matchesTitleAsCompilation,
  matchesTitleAsVolume,
} from '../title-match';
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

type DiscasSearchResult = {
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
    return this.cookies
      .entries()
      .map(([name, value]) => `${name}=${value}`)
      .toArray()
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
    if (location && response.status >= 300 && response.status < 400) {
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    return response;
  }

  throw new Error(`Too many redirects for ${url}`);
}

// 2作品収録のディスクは製作年欄に先頭作品の年しか出ないので解説文も見る。
// レビュー欄は他作品の年に触れるので対象にしない
const detailInformationSelector = 'p.p-text-content, table.c_table_product';

export function containsYear(html: string, year: number): boolean {
  const text = cheerio
    .load(html)(detailInformationSelector)
    .text()
    .normalize('NFKC');
  return new RegExp(String.raw`${year}\s*年`).test(text);
}

const MAX_DETAIL_LOOKUPS = 3;
// 制作年と日本公開年・授賞式年のずれを許す幅。同名の別作品（リメイク・旧作）は概ねこれより離れている
const YEAR_TOLERANCE = 2;

function parseProductionYear(html: string): number | undefined {
  const text = cheerio
    .load(html)('table.c_table_product')
    .text()
    .normalize('NFKC');
  const year = /製作年:\s*(\d{4})\s*年/.exec(text)?.[1];
  return year ? Number(year) : undefined;
}

async function findExactMatch(
  results: DiscasSearchResult[],
  targetTitles: string[],
  year: number | undefined,
  jar: CookieJar,
  fetchImpl: FetchLike,
): Promise<{matched?: DiscasSearchResult; mismatches: string[]}> {
  const candidates = results.filter(result =>
    matchesTitle(result.title, targetTitles),
  );
  if (year === undefined) {
    return {matched: candidates[0], mismatches: []};
  }

  const mismatches: string[] = [];
  for (const candidate of candidates.slice(0, MAX_DETAIL_LOOKUPS)) {
    const response = await fetchWithSession(
      candidate.detailUrl,
      jar,
      fetchImpl,
    );
    const productionYear = response.ok
      ? parseProductionYear(
          new TextDecoder('shift_jis').decode(await response.arrayBuffer()),
        )
      : undefined;
    if (
      productionYear === undefined ||
      Math.abs(productionYear - year) <= YEAR_TOLERANCE
    ) {
      return {matched: candidate, mismatches};
    }

    mismatches.push(`${candidate.title} (${productionYear})`);
  }

  return {mismatches};
}

async function findMatchingRelease(
  results: DiscasSearchResult[],
  targetTitles: string[],
  year: number | undefined,
  jar: CookieJar,
  fetchImpl: FetchLike,
): Promise<DiscasSearchResult | undefined> {
  const candidates = results
    .filter(
      result =>
        matchesTitleAsVolume(result.title, targetTitles) ||
        matchesTitleAsCompilation(result.title, targetTitles),
    )
    .slice(0, MAX_DETAIL_LOOKUPS);

  for (const candidate of candidates) {
    const response = await fetchWithSession(
      candidate.detailUrl,
      jar,
      fetchImpl,
    );
    if (!response.ok) {
      continue;
    }

    const html = new TextDecoder('shift_jis').decode(
      await response.arrayBuffer(),
    );
    if (year && !containsYear(html, year)) {
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
    return {
      source: 'discas',
      status: 'ng',
      detail: 'No Japanese title (not searched)',
    };
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
    const {matched, mismatches} = await findExactMatch(
      results,
      targetTitles,
      options.year,
      jar,
      fetchImpl,
    );
    if (matched) {
      return {
        source: 'discas',
        status: 'ok',
        detail: `Matched: ${matched.title}`,
      };
    }

    const release = await findMatchingRelease(
      results,
      targetTitles,
      options.year,
      jar,
      fetchImpl,
    );

    return release
      ? {
          source: 'discas',
          status: 'ok',
          detail: `Matched release: ${release.title}`,
        }
      : {
          source: 'discas',
          status: 'ng',
          detail:
            mismatches.length > 0
              ? `Title matched but year differs: ${mismatches.join(', ')}`
              : `No match in ${results.length} results`,
        };
  } catch (error) {
    return {
      source: 'discas',
      status: 'error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
