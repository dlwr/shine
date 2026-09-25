type ProxyEnvironment = {DB: D1Database; PROXY_KEY: string};

type ProxyQuery = {
  sql: string;
  params: unknown[];
  method: 'run' | 'all' | 'values' | 'get';
};

const execute = async (
  database: D1Database,
  query: ProxyQuery,
): Promise<{rows: unknown[] | undefined}> => {
  const statement = database.prepare(query.sql).bind(...query.params);
  if (query.method === 'run') {
    await statement.run();
    return {rows: []};
  }

  const rows = await statement.raw();
  return {rows: query.method === 'get' ? rows[0] : rows};
};

const batchRows = (
  method: ProxyQuery['method'],
  rows: unknown[][],
): unknown[] | undefined => {
  if (method === 'run') {
    return [];
  }

  return method === 'get' ? rows[0] : rows;
};

export default {
  async fetch(request, environment) {
    if (
      request.headers.get('authorization') !== `Bearer ${environment.PROXY_KEY}`
    ) {
      return new Response('forbidden', {status: 403});
    }

    const body = await request.json<ProxyQuery | {batch: ProxyQuery[]}>();
    try {
      if ('batch' in body) {
        const statements = body.batch.map(query =>
          environment.DB.prepare(query.sql).bind(...query.params),
        );
        const results = await environment.DB.batch(statements);
        return Response.json(
          results.map((result, index) => ({
            rows: batchRows(
              body.batch[index].method,
              result.results.map(row => Object.values(row as object)),
            ),
          })),
        );
      }

      return Response.json(await execute(environment.DB, body));
    } catch (error) {
      return new Response(String(error), {status: 500});
    }
  },
} satisfies ExportedHandler<ProxyEnvironment>;
