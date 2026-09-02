export const PLAN_ROWS_READ_LIMIT = 100_000_000_000;
export const DAILY_ROWS_READ_THRESHOLD = 1_000_000_000;
export const MONTHLY_WARNING_RATIO = 0.8;

const USAGE_API_BASE = 'https://api.turso.tech/v1/organizations';
const DAY_MS = 86_400_000;

export type UsageSnapshot = {
  last24hRowsRead: number;
  monthToDateRowsRead: number;
  now: Date;
};

export type UsageEvaluation = {
  alerts: string[];
  summary: string;
};

export type PlatformApiCredentials = {
  token: string;
  organization: string;
};

export function billingCycle(now: Date): {start: Date; end: Date} {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
  };
}

export function formatRows(rows: number): string {
  if (rows >= 1_000_000_000) {
    return `${(rows / 1_000_000_000).toFixed(1)}B`;
  }

  if (rows >= 1_000_000) {
    return `${Math.round(rows / 1_000_000)}M`;
  }

  return String(rows);
}

export function evaluateTursoUsage(
  snapshot: UsageSnapshot,
  limit = PLAN_ROWS_READ_LIMIT,
): UsageEvaluation {
  const {last24hRowsRead, monthToDateRowsRead, now} = snapshot;
  const {end} = billingCycle(now);
  const remainingDays = (end.getTime() - now.getTime()) / DAY_MS;
  const projectedRowsRead =
    monthToDateRowsRead + last24hRowsRead * remainingDays;
  const usedPercent = Math.round((monthToDateRowsRead / limit) * 100);

  const alerts: string[] = [];

  if (last24hRowsRead > DAILY_ROWS_READ_THRESHOLD) {
    alerts.push(
      `直近24時間の読み取りが ${formatRows(last24hRowsRead)} 行（閾値 ${formatRows(DAILY_ROWS_READ_THRESHOLD)}）`,
    );
  }

  if (monthToDateRowsRead >= limit * MONTHLY_WARNING_RATIO) {
    alerts.push(
      `月累計が ${formatRows(monthToDateRowsRead)} / ${formatRows(limit)}（${usedPercent}%）に達した`,
    );
  }

  if (projectedRowsRead > limit) {
    alerts.push(
      `このペースでは月末までに上限を超える（予測 ${formatRows(projectedRowsRead)} / ${formatRows(limit)}）`,
    );
  }

  const summary = `Turso 読み取り: 直近24h ${formatRows(last24hRowsRead)} / 月累計 ${formatRows(monthToDateRowsRead)} / ${formatRows(limit)}（${usedPercent}%） / 月末予測 ${formatRows(projectedRowsRead)}（残り ${remainingDays.toFixed(1)} 日）`;

  return {alerts, summary};
}

export async function fetchRowsRead(
  credentials: PlatformApiCredentials,
  from: Date,
  to: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const url = new URL(`${USAGE_API_BASE}/${credentials.organization}/usage`);
  url.searchParams.set('from', from.toISOString());
  url.searchParams.set('to', to.toISOString());

  const response = await fetchImpl(url.href, {
    headers: {Authorization: `Bearer ${credentials.token}`},
  });

  if (!response.ok) {
    throw new Error(`Turso usage API failed: ${response.status}`);
  }

  const body = (await response.json()) as {
    organization?: {usage?: {rows_read?: number}};
  };
  const rowsRead = body.organization?.usage?.rows_read;

  if (typeof rowsRead !== 'number') {
    throw new TypeError('Turso usage API returned no rows_read');
  }

  return rowsRead;
}
