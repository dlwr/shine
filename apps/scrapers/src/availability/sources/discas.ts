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

async function establishSession(fetchImpl: FetchLike): Promise<string> {
  const response = await fetchImpl(
    'https://movie-tsutaya.tsite.jp/netdvd/dvd/top.do',
    {
      headers: {'User-Agent': USER_AGENT},
      redirect: 'manual',
    },
  );

  return response.headers
    .getSetCookie()
    .map(cookie => cookie.split(';')[0])
    .join('; ');
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
    const cookie = await establishSession(fetchImpl);
    const url = `https://movie-tsutaya.tsite.jp/netdvd/dvd/searchDvdBd.do?k=${encodeShiftJisQuery(query)}`;
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Cookie: cookie,
        Referer: 'https://movie-tsutaya.tsite.jp/netdvd/dvd/top.do',
      },
    });
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
