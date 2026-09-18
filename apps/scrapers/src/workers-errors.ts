const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const GRAPHQL_TIMEOUT_MS = 30_000;

const MONITORED_SCRIPTS = ['shine-api', 'shine-front', 'shine-og'];

export type CloudflareCredentials = {
  token: string;
  account: string;
};

export type WorkerInvocations = {
  scriptName: string;
  requests: number;
  errors: number;
};

type GraphqlResponse = {
  data?: {
    viewer?: {
      accounts?: Array<{
        workersInvocationsAdaptive?: Array<{
          dimensions: {scriptName: string};
          sum: {requests: number; errors: number};
        }>;
      }>;
    };
  };
  errors?: Array<{message: string}>;
};

function invocationsQuery(
  account: string,
  from: Date,
  to: Date,
  scripts: string[],
): string {
  return `query {
  viewer {
    accounts(filter: {accountTag: "${account}"}) {
      workersInvocationsAdaptive(
        limit: 100
        filter: {scriptName_in: ${JSON.stringify(scripts)}, datetime_geq: "${from.toISOString()}", datetime_leq: "${to.toISOString()}"}
      ) {
        dimensions {
          scriptName
        }
        sum {
          requests
          errors
        }
      }
    }
  }
}`;
}

export async function fetchWorkerInvocations(
  credentials: CloudflareCredentials,
  from: Date,
  to: Date,
  fetchImpl: typeof fetch = fetch,
  scripts: string[] = MONITORED_SCRIPTS,
): Promise<WorkerInvocations[]> {
  const response = await fetchImpl(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query: invocationsQuery(credentials.account, from, to, scripts),
    }),
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
    body.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
  return rows.map(row => ({
    scriptName: row.dimensions.scriptName,
    requests: row.sum.requests,
    errors: row.sum.errors,
  }));
}

export function evaluateWorkerErrors(
  invocations: WorkerInvocations[],
  windowHours: number,
): {alerts: string[]; summary: string} {
  const alerts = invocations
    .filter(invocation => invocation.errors > 0)
    .map(invocation => {
      const rate =
        invocation.requests > 0
          ? (invocation.errors / invocation.requests) * 100
          : 0;
      return `${invocation.scriptName} が直近${windowHours}時間で ${invocation.errors.toLocaleString('en-US')} 件失敗（${invocation.requests.toLocaleString('en-US')} リクエスト中 ${rate.toFixed(2)}%）`;
    });

  const detail =
    invocations.length > 0
      ? invocations
          .map(
            invocation =>
              `${invocation.scriptName} ${invocation.requests.toLocaleString('en-US')} req / ${invocation.errors.toLocaleString('en-US')} err`,
          )
          .join('、')
      : '記録が無い';

  return {alerts, summary: `Workers 直近${windowHours}時間: ${detail}`};
}
