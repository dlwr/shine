const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const GRAPHQL_TIMEOUT_MS = 30_000;
const HOUR_MS = 3_600_000;

// 窓の始端が 7 日より前だと窓全体が 10 単位のサンプル推定に落ちるので、1 時間縮めて崖を踏まない
const LEADING_INDICATOR_WINDOW_HOURS = 7 * 24 - 1;

export const DEFAULT_CLOUDFLARE_ACCOUNT_ID = '2097531fd91db13e3e83de98d54962f1';
const DEFAULT_WEB_ANALYTICS_SITE_TAG = '9602f73a32304a60b7a170124731564a';

export type WebAnalyticsCredentials = {
  token: string;
  account: string;
  siteTag: string;
};

export function resolveWebAnalyticsCredentials(
  environment: NodeJS.ProcessEnv,
): WebAnalyticsCredentials | undefined {
  const token = environment.CLOUDFLARE_API_TOKEN || '';
  if (!token) {
    return undefined;
  }

  return {
    token,
    account: environment.CLOUDFLARE_ACCOUNT_ID || DEFAULT_CLOUDFLARE_ACCOUNT_ID,
    siteTag:
      environment.CF_WEB_ANALYTICS_SITE_TAG || DEFAULT_WEB_ANALYTICS_SITE_TAG,
  };
}

export type PageTraffic = {
  path: string;
  pageviews: number;
  visits: number;
};

export type MonthlyPickPage = {
  month: string;
  title: string;
  path: string;
};

type GraphqlResponse = {
  data?: {
    viewer?: {
      accounts?: Array<{
        rumPageloadEventsAdaptiveGroups?: Array<{
          count: number;
          sum: {visits: number};
          dimensions: {requestPath: string};
        }>;
      }>;
    };
  };
  errors?: Array<{message: string}>;
};

export function leadingIndicatorWindow(now: Date): {from: Date; to: Date} {
  return {
    from: new Date(now.getTime() - LEADING_INDICATOR_WINDOW_HOURS * HOUR_MS),
    to: now,
  };
}

function trafficQuery(
  credentials: WebAnalyticsCredentials,
  from: Date,
  to: Date,
): string {
  return `query {
  viewer {
    accounts(filter: {accountTag: "${credentials.account}"}) {
      rumPageloadEventsAdaptiveGroups(
        limit: 1000
        filter: {siteTag: "${credentials.siteTag}", countryName: "JP", bot: 0, datetime_geq: "${from.toISOString()}", datetime_leq: "${to.toISOString()}"}
      ) {
        count
        sum {
          visits
        }
        dimensions {
          requestPath
        }
      }
    }
  }
}`;
}

export async function fetchJapanPageTraffic(
  credentials: WebAnalyticsCredentials,
  from: Date,
  to: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<PageTraffic[]> {
  const response = await fetchImpl(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({query: trafficQuery(credentials, from, to)}),
    signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Cloudflare GraphQL が失敗しました: HTTP ${response.status}`,
    );
  }

  const body = (await response.json()) as GraphqlResponse;
  if (body.errors && body.errors.length > 0) {
    throw new Error(body.errors.map(error => error.message).join('; '));
  }

  const rows =
    body.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups;
  if (!rows || rows.length === 0) {
    throw new Error(
      'Cloudflare GraphQL が空応答を返しました（記録が 1 件も無い窓は想定しない）',
    );
  }

  return rows.map(row => ({
    path: row.dimensions.requestPath,
    pageviews: row.count,
    visits: row.sum.visits,
  }));
}

function tokyoDateTime(date: Date): string {
  return date
    .toLocaleString('sv-SE', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', '');
}

function isSampled(traffic: PageTraffic[]): boolean {
  return (
    traffic.length > 0 &&
    traffic.every(page => page.pageviews % 10 === 0 && page.visits % 10 === 0)
  );
}

export async function leadingIndicatorReport(
  credentials: WebAnalyticsCredentials,
  monthlyPicks: MonthlyPickPage[],
  now: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const window = leadingIndicatorWindow(now);
  const fetchTraffic = () =>
    fetchJapanPageTraffic(credentials, window.from, window.to, fetchImpl);
  let traffic: PageTraffic[];
  try {
    traffic = await fetchTraffic();
  } catch {
    traffic = await fetchTraffic();
  }
  return formatLeadingIndicator(traffic, monthlyPicks, window);
}

function isVisitorPath(path: string): boolean {
  return path !== '/admin' && !path.startsWith('/admin/');
}

export function formatLeadingIndicator(
  allTraffic: PageTraffic[],
  monthlyPicks: MonthlyPickPage[],
  window: {from: Date; to: Date},
  topPaths = 5,
): string {
  const traffic = allTraffic.filter(page => isVisitorPath(page.path));
  const total = {pageviews: 0, visits: 0};
  for (const page of traffic) {
    total.pageviews += page.pageviews;
    total.visits += page.visits;
  }
  const byPath = new Map(traffic.map(page => [page.path, page]));
  const top = traffic
    .toSorted((a, b) => b.pageviews - a.pageviews)
    .slice(0, topPaths)
    .map(page => `${page.path} ${page.pageviews}`)
    .join('、');

  return [
    `先行指標（国=Japan・bot と /admin 除外、${tokyoDateTime(window.from)} 〜 ${tokyoDateTime(window.to)} JST）${isSampled(traffic) ? '（値が全部 10 の倍数なのでサンプル推定の可能性がある）' : ''}`,
    `全体: PV ${total.pageviews} / 訪問 ${total.visits}`,
    ...monthlyPicks.map(pick => {
      const page = byPath.get(pick.path);
      return `${pick.month} ${pick.title}: PV ${page?.pageviews ?? 0} / 訪問 ${page?.visits ?? 0}`;
    }),
    `上位のパス: ${top || 'なし'}`,
  ].join('\n');
}
