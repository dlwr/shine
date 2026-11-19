import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {migrate} from '@shine/database/testing';
import {beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {mcpRoutes} from '../routes/mcp';
import {seedPublicData} from './public-data-seed';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type RpcResponse = {
  result?: {
    tools?: Array<{
      name: string;
      title?: string;
      description?: string;
      annotations?: {readOnlyHint?: boolean};
    }>;
    content?: Array<{type: string; text: string}>;
    isError?: boolean;
  };
  error?: {message: string};
};

let databaseFileUrl: string;
let nextIp = 0;

beforeAll(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-mcp-'));
  databaseFileUrl = `file:${path.join(directory, 'test.db')}`;
  const database = getDatabase({DATABASE_FILE_URL: databaseFileUrl});
  await migrate(database, {migrationsFolder});
  await seedPublicData(database);
});

function createEnvironment(overrides: Partial<Environment> = {}): Environment {
  return {DATABASE_FILE_URL: databaseFileUrl, ...overrides};
}

async function post(
  environment: Environment,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return mcpRoutes.request(
    '/',
    {
      method: 'POST',
      headers: {
        host: 'shine-film.com',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-06-18',
        ...headers,
      },
      body: JSON.stringify(body),
    },
    environment,
  );
}

async function readRpc(response: Response): Promise<RpcResponse> {
  const text = await response.text();
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const data = text
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim())
      .at(-1);
    return JSON.parse(data ?? '{}') as RpcResponse;
  }

  return JSON.parse(text) as RpcResponse;
}

async function callTool(
  environment: Environment,
  name: string,
  arguments_: Record<string, unknown>,
): Promise<{isError: boolean | undefined; data: unknown}> {
  const response = await post(
    environment,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {name, arguments: arguments_},
    },
    {'cf-connecting-ip': `10.0.0.${nextIp++}`},
  );
  expect(response.status).toBe(200);
  const rpc = await readRpc(response);
  const text = rpc.result?.content?.[0]?.text ?? '';
  return {
    isError: rpc.result?.isError,
    data: rpc.result?.isError ? text : JSON.parse(text),
  };
}

describe('POST /mcp', () => {
  let environment: Environment;

  beforeEach(() => {
    environment = createEnvironment();
  });

  it('initialize に応える', async () => {
    const response = await post(environment, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {name: 'test', version: '1.0.0'},
      },
    });

    expect(response.status).toBe(200);
    const rpc = (await readRpc(response)) as {
      result?: {serverInfo?: {name: string}};
    };
    expect(rpc.result?.serverInfo?.name).toBe('shine-film');
  });

  it('notifications/initialized を受け付ける', async () => {
    const response = await post(environment, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    expect(response.status).toBe(202);
  });

  it('tools/list は 4 本の読み取り専用のツールを返す', async () => {
    const response = await post(environment, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    const rpc = await readRpc(response);
    const tools = rpc.result?.tools ?? [];

    expect(
      tools.map(tool => tool.name).toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(['get_award_year', 'get_movie', 'list_awards', 'search_movies']);
    for (const tool of tools) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.description, tool.name).toContain('without notice');
    }
  });

  it('search_movies は邦題で引けて、受賞と視聴可否と URL を返す', async () => {
    const {data} = await callTool(environment, 'search_movies', {
      query: 'アメリカン',
    });

    expect(data).toMatchObject({
      movies: [
        {
          uid: 'movie-beauty',
          title: 'アメリカン・ビューティー',
          year: 1999,
          url: 'https://shine-film.com/movies/movie-beauty',
          awards: expect.arrayContaining([
            {
              slug: 'academy-best-picture',
              name: '作品賞',
              organization: 'アカデミー賞',
              isWinner: true,
            },
          ]),
        },
      ],
    });
    const [movie] = (data as {movies: Array<{japanAvailability: string}>})
      .movies;
    expect(movie.japanAvailability).toBeTypeOf('string');
  });

  it('search_movies は原題でも引ける', async () => {
    const {data} = await callTool(environment, 'search_movies', {
      query: 'Gladiator',
    });

    expect(data).toMatchObject({
      movies: [{uid: 'movie-gladiator', japanAvailability: 'unwatchable'}],
    });
  });

  it('search_movies は locale=en で英語のページの URL を返す', async () => {
    const {data} = await callTool(environment, 'search_movies', {
      query: 'Gladiator',
      locale: 'en',
    });

    expect(data).toMatchObject({
      movies: [
        {url: 'https://shine-film.com/movies/movie-gladiator?locale=en'},
      ],
    });
  });

  it('get_movie は受賞・クレジット・視聴可否・URL を返す', async () => {
    const {data} = await callTool(environment, 'get_movie', {
      uid: 'movie-beauty',
    });

    expect(data).toMatchObject({
      uid: 'movie-beauty',
      title: 'アメリカン・ビューティー',
      url: 'https://shine-film.com/movies/movie-beauty',
      nominations: expect.arrayContaining([
        expect.objectContaining({ceremonyYear: 2000, isWinner: true}),
      ]),
    });
    expect(data).toHaveProperty('japanAvailability.status');
    expect(data).toHaveProperty('credits');
  });

  it('get_movie はソフト削除された映画を返さない', async () => {
    const {isError} = await callTool(environment, 'get_movie', {
      uid: 'movie-deleted',
    });

    expect(isError).toBe(true);
  });

  it('list_awards は賞の一覧と URL を返す', async () => {
    const {data} = await callTool(environment, 'list_awards', {});

    expect(data).toMatchObject({
      awards: expect.arrayContaining([
        expect.objectContaining({
          slug: 'academy-best-picture',
          hasYearPages: true,
          url: 'https://shine-film.com/awards/academy-best-picture',
        }),
      ]),
    });
  });

  it('get_award_year は受賞・ノミネート作と視聴可否と URL を返す', async () => {
    const {data} = await callTool(environment, 'get_award_year', {
      slug: 'academy-best-picture',
      year: 2000,
    });

    expect(data).toMatchObject({
      slug: 'academy-best-picture',
      year: 2000,
      url: 'https://shine-film.com/awards/academy-best-picture/2000',
      movies: expect.arrayContaining([
        expect.objectContaining({
          uid: 'movie-beauty',
          isWinner: true,
          url: 'https://shine-film.com/movies/movie-beauty',
        }),
      ]),
    });
    expect(data).toHaveProperty('availabilitySummary.total');
  });

  it('get_award_year は知らない賞にエラーを返す', async () => {
    const {isError} = await callTool(environment, 'get_award_year', {
      slug: 'no-such-award',
      year: 2000,
    });

    expect(isError).toBe(true);
  });

  it('MCP_DISABLED が true なら 503 を返す', async () => {
    const response = await post(createEnvironment({MCP_DISABLED: 'true'}), {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    expect(response.status).toBe(503);
  });

  it('許可していない Host には 403 を返す', async () => {
    const response = await post(
      environment,
      {jsonrpc: '2.0', id: 1, method: 'tools/list'},
      {host: 'evil.example'},
    );

    expect(response.status).toBe(403);
  });

  it('同じ IP からの呼び出しが多すぎると 429 を返す', async () => {
    const headers = {'cf-connecting-ip': '192.0.2.1'};
    const statuses: number[] = [];
    for (let index = 0; index < 61; index++) {
      const response = await post(
        environment,
        {jsonrpc: '2.0', id: 1, method: 'tools/list'},
        headers,
      );
      statuses.push(response.status);
    }

    expect(statuses.at(0)).toBe(200);
    expect(statuses.at(-1)).toBe(429);
  });
});
