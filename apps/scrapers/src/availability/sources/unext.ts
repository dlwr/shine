import {titleMatches} from '../title-match';
import type {FetchLike, SourceCheckResult} from '../types';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// U-NEXTのWebクライアント(cosmo)が使うpersisted queryを再利用する。
// クライアント更新でハッシュが失効した場合はerrorになり、他ソースで判定が継続される。
const APOLLO_CLIENT_NAME = 'cosmo';
const APOLLO_CLIENT_VERSION = 'v126.0-prod-017e302';
const FREEWORD_SEARCH_HASH =
  'e972baff0299d3cf64a3eaec1f9387500dadeabfe994041f98003bf42d614bb9';

type UnextSearchResponse = {
  errors?: Array<{message?: string}>;
  data?: {
    webfront_videoFreewordSearch?: {
      titles?: Array<{titleName?: string | null}>;
    };
  };
};

export function parseUnextTitles(response: unknown): string[] {
  const titles =
    (response as UnextSearchResponse).data?.webfront_videoFreewordSearch
      ?.titles ?? [];
  return titles
    .map(title => title.titleName ?? '')
    .filter(title => title !== '');
}

export async function checkUnext(
  targetTitles: string[],
  fetchImpl: FetchLike = fetch,
): Promise<SourceCheckResult> {
  const query = targetTitles.find(title => title.trim() !== '');
  if (!query) {
    return {source: 'unext', status: 'error', detail: 'No title to search'};
  }

  const parameters = new URLSearchParams({
    operationName: 'cosmo_allFreewordSearch',
    variables: JSON.stringify({
      query,
      page: 1,
      pageSize: 20,
      videoSortOrder: 'RECOMMEND',
      bookSortOrder: 'RECOMMEND',
      includePositionPlayLive: true,
    }),
    extensions: JSON.stringify({
      persistedQuery: {version: 1, sha256Hash: FREEWORD_SEARCH_HASH},
    }),
  });

  try {
    const response = await fetchImpl(
      `https://cc.unext.jp/?${parameters.toString()}`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
          'apollographql-client-name': APOLLO_CLIENT_NAME,
          'apollographql-client-version': APOLLO_CLIENT_VERSION,
        },
      },
    );

    const body = (await response.json()) as UnextSearchResponse;
    if (body.errors && body.errors.length > 0) {
      return {
        source: 'unext',
        status: 'error',
        detail: body.errors[0].message ?? 'GraphQL error',
      };
    }

    if (!response.ok) {
      return {
        source: 'unext',
        status: 'error',
        detail: `HTTP ${response.status}`,
      };
    }

    const resultTitles = parseUnextTitles(body);
    const matched = resultTitles.find(title =>
      titleMatches(title, targetTitles),
    );

    return matched
      ? {source: 'unext', status: 'ok', detail: `Matched: ${matched}`}
      : {
          source: 'unext',
          status: 'ng',
          detail: `No match in ${resultTitles.length} results`,
        };
  } catch (error) {
    return {
      source: 'unext',
      status: 'error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
