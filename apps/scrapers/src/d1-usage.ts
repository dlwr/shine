import {billingCycle, formatRows} from './turso-usage';

const INCLUDED_ROWS_READ = 25_000_000_000;
const INCLUDED_ROWS_WRITTEN = 50_000_000;
const HOURLY_ROWS_READ_THRESHOLD = 100_000_000;
const MONTHLY_WARNING_RATIO = 0.8;

const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const GRAPHQL_TIMEOUT_MS = 30_000;
const DAY_MS = 86_400_000;

export const PRODUCTION_D1_DATABASE_ID = 'ef1ae873-1ab5-4b99-aa60-9673857c0974';

export type D1UsageSnapshot = {
  lastHourRowsRead: number;
  last24hRowsRead: number;
  monthToDateRowsRead: number;
  monthToDateRowsWritten: number;
  now: Date;
};

export type CloudflareCredentials = {
  token: string;
  account: string;
};

type GraphqlResponse = {
  data?: {
    viewer?: {
      accounts?: Array<{
        d1AnalyticsAdaptiveGroups?: Array<{
          sum: {rowsRead: number; rowsWritten: number};
        }>;
      }>;
    };
  };
  errors?: Array<{message: string}>;
};

const percentOf = (value: number, limit: number) =>
  Math.round((value / limit) * 100);

export function evaluateD1Usage(snapshot: D1UsageSnapshot): {
  alerts: string[];
  summary: string;
} {
  const {
    lastHourRowsRead,
    last24hRowsRead,
    monthToDateRowsRead,
    monthToDateRowsWritten,
    now,
  } = snapshot;
  const {end} = billingCycle(now);
  const remainingDays = (end.getTime() - now.getTime()) / DAY_MS;
  const projectedRowsRead =
    monthToDateRowsRead + last24hRowsRead * remainingDays;

  const alerts: string[] = [];

  if (lastHourRowsRead > HOURLY_ROWS_READ_THRESHOLD) {
    alerts.push(
      `直近1時間の読み取りが ${formatRows(lastHourRowsRead)} 行（閾値 ${formatRows(HOURLY_ROWS_READ_THRESHOLD)}）`,
    );
  }

  if (monthToDateRowsRead >= INCLUDED_ROWS_READ * MONTHLY_WARNING_RATIO) {
    alerts.push(
      `読み取りの月累計が ${formatRows(monthToDateRowsRead)} / ${formatRows(INCLUDED_ROWS_READ)}（${percentOf(monthToDateRowsRead, INCLUDED_ROWS_READ)}%）に達した`,
    );
  }

  if (projectedRowsRead > INCLUDED_ROWS_READ) {
    alerts.push(
      `このペースでは月末までに読み取りの枠を超える（予測 ${formatRows(projectedRowsRead)} / ${formatRows(INCLUDED_ROWS_READ)}）`,
    );
  }

  if (monthToDateRowsWritten >= INCLUDED_ROWS_WRITTEN * MONTHLY_WARNING_RATIO) {
    alerts.push(
      `書き込みの月累計が ${formatRows(monthToDateRowsWritten)} / ${formatRows(INCLUDED_ROWS_WRITTEN)}（${percentOf(monthToDateRowsWritten, INCLUDED_ROWS_WRITTEN)}%）に達した`,
    );
  }

  const summary = `D1 読み取り: 直近1h ${formatRows(lastHourRowsRead)} / 直近24h ${formatRows(last24hRowsRead)} / 月累計 ${formatRows(monthToDateRowsRead)} / ${formatRows(INCLUDED_ROWS_READ)}（${percentOf(monthToDateRowsRead, INCLUDED_ROWS_READ)}%） / 書き込み月累計 ${formatRows(monthToDateRowsWritten)}`;

  return {alerts, summary};
}

export async function fetchD1Usage(
  credentials: CloudflareCredentials,
  databaseId: string,
  from: Date,
  to: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<{rowsRead: number; rowsWritten: number}> {
  const query = `query {
  viewer {
    accounts(filter: {accountTag: "${credentials.account}"}) {
      d1AnalyticsAdaptiveGroups(
        limit: 1
        filter: {databaseId: "${databaseId}", datetimeHour_geq: "${from.toISOString()}", datetimeHour_lt: "${to.toISOString()}"}
      ) {
        sum {
          rowsRead
          rowsWritten
        }
      }
    }
  }
}`;

  const response = await fetchImpl(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({query}),
    signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Cloudflare GraphQL failed: ${response.status}`);
  }

  const body = (await response.json()) as GraphqlResponse;
  if (body.errors?.length) {
    throw new Error(body.errors.map(error => error.message).join('; '));
  }

  const [group] =
    body.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups ?? [];
  return {
    rowsRead: group?.sum.rowsRead ?? 0,
    rowsWritten: group?.sum.rowsWritten ?? 0,
  };
}
