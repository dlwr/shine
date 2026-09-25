type ProxyEnvironment = {DB: D1Database; PROXY_KEY: string};

type ProxyQuery = {
  sql: string;
  params: unknown[];
  method: 'run' | 'all' | 'values' | 'get';
};

type ProxyBody = ProxyQuery | {batch: ProxyQuery[]};

const hasKey = (header: string | null, key: string): boolean => {
  const expected = `Bearer ${key}`;
  if (!key || header?.length !== expected.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= header.codePointAt(index)! ^ expected.codePointAt(index)!;
  }

  return difference === 0;
};

const execute = async (
  database: D1Database,
  query: ProxyQuery,
): Promise<{rows?: unknown[]}> => {
  const statement = database.prepare(query.sql).bind(...query.params);
  if (query.method === 'run') {
    await statement.run();
    return {rows: []};
  }

  const rows = await statement.raw();
  return {rows: query.method === 'get' ? rows[0] : rows};
};

const databaseProxy = {
  async fetch(request, environment) {
    if (!hasKey(request.headers.get('authorization'), environment.PROXY_KEY)) {
      return new Response('forbidden', {status: 403});
    }

    const body = await request.json<ProxyBody>();
    try {
      if (!('batch' in body)) {
        return Response.json(await execute(environment.DB, body));
      }

      if (body.batch.some(query => query.method !== 'run')) {
        return new Response('batch accepts writes only', {status: 400});
      }

      await environment.DB.batch(
        body.batch.map(query =>
          environment.DB.prepare(query.sql).bind(...query.params),
        ),
      );
      return Response.json(body.batch.map(() => ({rows: []})));
    } catch (error) {
      return new Response(String(error), {status: 500});
    }
  },
} satisfies ExportedHandler<ProxyEnvironment>;

export default databaseProxy;
