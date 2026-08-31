import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID ?? '2097531fd91db13e3e83de98d54962f1';
const SITE_TAG =
  process.env.CF_WEB_ANALYTICS_SITE_TAG ?? 'c0dd704af80b4024bf03df608f5e6123';
const SCRIPT_NAMES = ['shine-api', 'shine-front'];
const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';

function loadDevelopmentVariables(): void {
  const developmentVariablesPath = path.join(
    import.meta.dirname,
    '..',
    '.dev.vars',
  );
  if (!fs.existsSync(developmentVariablesPath)) {
    return;
  }

  for (const line of fs
    .readFileSync(developmentVariablesPath, 'utf8')
    .split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}

type GraphqlResponse = {
  data?: unknown;
  errors?: Array<{message: string}>;
};

async function graphql(token: string, query: string): Promise<unknown> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({query}),
  });

  const body = (await response.json()) as GraphqlResponse;
  if (body.errors && body.errors.length > 0) {
    throw new Error(body.errors.map(error => error.message).join('; '));
  }

  return body.data;
}

function workersQuery(start: string, end: string): string {
  return `
query {
  viewer {
    accounts(filter: {accountTag: "${ACCOUNT_ID}"}) {
      workersInvocationsAdaptive(
        limit: 100
        filter: {scriptName_in: ${JSON.stringify(SCRIPT_NAMES)}, datetime_geq: "${start}", datetime_leq: "${end}"}
      ) {
        dimensions {
          scriptName
        }
        sum {
          requests
          errors
          subrequests
        }
        quantiles {
          cpuTimeP50
          cpuTimeP99
          durationP50
          durationP99
          wallTimeP50
          wallTimeP99
        }
      }
    }
  }
}`;
}

function rumPerformanceQuery(start: string, end: string): string {
  return `
query {
  viewer {
    accounts(filter: {accountTag: "${ACCOUNT_ID}"}) {
      rumPerformanceEventsAdaptiveGroups(
        limit: 20
        filter: {siteTag: "${SITE_TAG}", datetime_geq: "${start}", datetime_leq: "${end}"}
        orderBy: [count_DESC]
      ) {
        count
        dimensions {
          countryName
        }
        quantiles {
          pageLoadTimeP50
          pageLoadTimeP75
          pageLoadTimeP90
          firstContentfulPaintP50
          firstContentfulPaintP75
        }
      }
    }
  }
}`;
}

function rumPathsQuery(start: string, end: string): string {
  return `
query {
  viewer {
    accounts(filter: {accountTag: "${ACCOUNT_ID}"}) {
      rumPageloadEventsAdaptiveGroups(
        limit: 15
        filter: {siteTag: "${SITE_TAG}", datetime_geq: "${start}", datetime_leq: "${end}"}
        orderBy: [count_DESC]
      ) {
        count
        dimensions {
          requestPath
        }
      }
    }
  }
}`;
}

async function main(): Promise<void> {
  loadDevelopmentVariables();

  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error(
      'CLOUDFLARE_API_TOKEN を .dev.vars か環境変数に設定してください（権限: Account Analytics:Read）',
    );
  }

  const daysArgument = process.argv.find(argument =>
    argument.startsWith('--days='),
  );
  const days = daysArgument ? Number(daysArgument.split('=', 2)[1]) : 3;
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  console.log(`期間: ${start} 〜 ${end}`);

  const queries = [
    {name: 'Workers invocations', query: workersQuery(start, end)},
    {
      name: 'RUM performance (country別)',
      query: rumPerformanceQuery(start, end),
    },
    {name: 'RUM pageloads (path別)', query: rumPathsQuery(start, end)},
  ];

  for (const {name, query} of queries) {
    console.log(`\n=== ${name} ===`);
    try {
      const data = await graphql(token, query);
      console.log(JSON.stringify(data, undefined, 2));
    } catch (error) {
      console.error(
        `取得失敗: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

await main();
