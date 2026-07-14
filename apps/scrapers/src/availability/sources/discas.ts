import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import {titleMatches} from '../title-match';
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

export function parseDiscasTitles(html: string): string[] {
  const $ = cheerio.load(html);
  return $('a[href*="goodsDetail.do"]')
    .map((_, element) => $(element).text())
    .get()
    .map(title => title.trim())
    .filter(title => title !== '');
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  absorb(response: Response): void {
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair] = setCookie.split(';');
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
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return response;
  }

  throw new Error(`Too many redirects for ${url}`);
}

export async function checkDiscas(
  targetTitles: string[],
  fetchImpl: FetchLike = fetch,
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
    const resultTitles = parseDiscasTitles(html);
    const matched = resultTitles.find(title =>
      titleMatches(title, targetTitles),
    );

    return matched
      ? {source: 'discas', status: 'ok', detail: `Matched: ${matched}`}
      : {
          source: 'discas',
          status: 'ng',
          detail: `No match in ${resultTitles.length} results`,
        };
  } catch (error) {
    return {
      source: 'discas',
      status: 'error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
