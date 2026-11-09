import {matchesTitle} from '../title-match';
import type {FetchLike, SourceCheckResult} from '../types';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// U-NEXTのWebクライアント(cosmo)が使うpersisted queryを再利用する。
// クライアント更新でハッシュが失効した場合はerrorになり、他ソースで判定が継続される。
const APOLLO_CLIENT_NAME = 'cosmo';
const APOLLO_CLIENT_VERSION = 'v126.0-prod-017e302';
const FREEWORD_SEARCH_HASH =
  'e972baff0299d3cf64a3eaec1f9387500dadeabfe994041f98003bf42d614bb9';
const VIDEO_TITLE_HASH =
  '33defdf169a4635dc86934f249d86581f51386cc18edef137d0b3f294b86dd5d';

// 制作年と日本公開年・授賞式年のずれを許す幅。同名の別作品（リメイク・旧作）は概ねこれより離れている
const YEAR_TOLERANCE = 2;
const MAX_DETAIL_LOOKUPS = 3;

const requestHeaders = {
  'User-Agent': USER_AGENT,
  'Content-Type': 'application/json',
  'apollographql-client-name': APOLLO_CLIENT_NAME,
  'apollographql-client-version': APOLLO_CLIENT_VERSION,
};

type UnextSearchResponse = {
  errors?: Array<{message?: string}>;
  data?: {
    webfront_videoFreewordSearch?: {
      titles?: Array<{id?: string | null; titleName?: string | null}>;
    };
  };
};

type UnextTitleResponse = {
  errors?: Array<{message?: string}>;
  data?: {
    webfront_title_stage?: {
      productionYear?: string | null;
      mainGenreId?: string | null;
    } | null;
  };
};

type UnextTitle = {id: string; titleName: string};

export function parseUnextTitles(response: unknown): string[] {
  const titles =
    (response as UnextSearchResponse).data?.webfront_videoFreewordSearch
      ?.titles ?? [];
  return titles
    .map(title => title.titleName ?? '')
    .filter(title => title !== '');
}

function parseUnextTitleEntries(response: unknown): UnextTitle[] {
  const titles =
    (response as UnextSearchResponse).data?.webfront_videoFreewordSearch
      ?.titles ?? [];
  return titles
    .filter(title => Boolean(title.id) && Boolean(title.titleName))
    .map(title => ({id: title.id ?? '', titleName: title.titleName ?? ''}));
}

async function fetchTitleStage(
  titleId: string,
  fetchImpl: FetchLike,
): Promise<{productionYear: number | undefined; isMusic: boolean}> {
  const parameters = new URLSearchParams({
    operationName: 'cosmo_getVideoTitle',
    variables: JSON.stringify({code: titleId}),
    extensions: JSON.stringify({
      persistedQuery: {version: 1, sha256Hash: VIDEO_TITLE_HASH},
    }),
  });
  const response = await fetchImpl(
    `https://cc.unext.jp/?${parameters.toString()}`,
    {headers: requestHeaders},
  );
  const body = (await response.json()) as UnextTitleResponse;
  if (body.errors && body.errors.length > 0) {
    throw new Error(body.errors[0].message ?? 'GraphQL error');
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const stage = body.data?.webfront_title_stage;
  const year = Math.trunc(Number(stage?.productionYear));
  return {
    productionYear:
      stage?.productionYear && Number.isFinite(year) && year > 0
        ? year
        : undefined,
    isMusic: stage?.mainGenreId === 'MUSIC_IDOL',
  };
}

async function verifyYear(
  candidates: UnextTitle[],
  year: number,
  fetchImpl: FetchLike,
): Promise<SourceCheckResult> {
  const mismatches: string[] = [];
  for (const candidate of candidates.slice(0, MAX_DETAIL_LOOKUPS)) {
    const {productionYear, isMusic} = await fetchTitleStage(
      candidate.id,
      fetchImpl,
    );
    if (
      !isMusic &&
      (productionYear === undefined ||
        Math.abs(productionYear - year) <= YEAR_TOLERANCE)
    ) {
      return {
        source: 'unext',
        status: 'ok',
        detail: `Matched: ${candidate.titleName}${productionYear ? ` (${productionYear})` : ''}`,
      };
    }

    mismatches.push(`${candidate.titleName} (${productionYear})`);
  }

  return {
    source: 'unext',
    status: 'ng',
    detail: `Title matched but year differs: ${mismatches.join(', ')}`,
  };
}

export async function checkUnext(
  targetTitles: string[],
  fetchImpl: FetchLike = fetch,
  options: {year?: number} = {},
): Promise<SourceCheckResult> {
  const query = targetTitles.find(title => title.trim() !== '');
  if (!query) {
    return {
      source: 'unext',
      status: 'ng',
      detail: 'No Japanese title (not searched)',
    };
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
      {headers: requestHeaders},
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

    const resultTitles = parseUnextTitleEntries(body);
    const matched = resultTitles.filter(title =>
      matchesTitle(title.titleName, targetTitles),
    );

    if (matched.length === 0) {
      return {
        source: 'unext',
        status: 'ng',
        detail: `No match in ${resultTitles.length} results`,
      };
    }

    if (options.year === undefined) {
      return {
        source: 'unext',
        status: 'ok',
        detail: `Matched: ${matched[0].titleName}`,
      };
    }

    return await verifyYear(matched, options.year, fetchImpl);
  } catch (error) {
    return {
      source: 'unext',
      status: 'error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
