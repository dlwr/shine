import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import {titleMatches} from '../title-match';
import type {FetchLike, SourceCheckResult} from '../types';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function encodeEucJpPathSegment(text: string): string {
  const bytes = iconv.encode(text, 'euc-jp');
  let encoded = '';
  for (const byte of bytes) {
    encoded += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }

  return encoded;
}

export function parseGeoTitles(html: string): string[] {
  const $ = cheerio.load(html);
  return $('a.productTitleCut')
    .map((_, element) => $(element).attr('title') ?? $(element).text())
    .get()
    .map(title => title.trim())
    .filter(title => title !== '');
}

export async function checkGeo(
  targetTitles: string[],
  fetchImpl: FetchLike = fetch,
): Promise<SourceCheckResult> {
  const query = targetTitles.find(title => title.trim() !== '');
  if (!query) {
    return {source: 'geo', status: 'error', detail: 'No title to search'};
  }

  const url = `https://rental.geo-online.co.jp/search2/q/c-dvd/dg-/p-1/q-${encodeEucJpPathSegment(query)}/qf-title/`;

  try {
    const response = await fetchImpl(url, {
      headers: {'User-Agent': USER_AGENT},
    });
    if (!response.ok) {
      return {
        source: 'geo',
        status: 'error',
        detail: `HTTP ${response.status}`,
      };
    }

    const html = new TextDecoder('euc-jp').decode(await response.arrayBuffer());
    const resultTitles = parseGeoTitles(html);
    const matched = resultTitles.find(title =>
      titleMatches(title, targetTitles),
    );

    return matched
      ? {source: 'geo', status: 'ok', detail: `Matched: ${matched}`}
      : {
          source: 'geo',
          status: 'ng',
          detail: `No match in ${resultTitles.length} results`,
        };
  } catch (error) {
    return {
      source: 'geo',
      status: 'error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
