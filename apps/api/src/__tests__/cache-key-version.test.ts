import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {awardsRoutes} from '../routes/awards';
import {crossingsRoutes} from '../routes/crossings';
import {moviesRoutes} from '../routes/movies';
import {peopleRoutes} from '../routes/people';
import {quizRoutes} from '../routes/quiz';
import {searchRoutes} from '../routes/search';
import {selectionsRoutes} from '../routes/selections';
import {uncrownedRoutes} from '../routes/uncrowned';
import {watchedRoutes} from '../routes/watched';
import {yearsRoutes} from '../routes/years';
import {
  checkCacheShape,
  describeShape,
  normalizeCacheKey,
  UPDATE_COMMAND,
  type CacheShapeCheck,
} from './cache-shape';
import {seededPeopleUids, seedPublicData} from './public-data-seed';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);
const recordPath = path.join(currentDirectory, 'cache-payload-shapes.json');
const isUpdating = process.env.UPDATE_CACHE_SHAPES === '1';

type Routes = {
  request: (
    path: string,
    init: RequestInit,
    environment: Environment,
    executionContext: ExecutionContext,
  ) => Response | Promise<Response>;
};

type Exercise = {
  name: string;
  routes: Routes;
  path: string;
};

const exercises: Exercise[] = [
  {name: '賞一覧', routes: awardsRoutes, path: '/'},
  {name: '賞ページ', routes: awardsRoutes, path: '/academy-best-picture'},
  {
    name: '賞の年別ページ',
    routes: awardsRoutes,
    path: '/academy-best-picture/2000',
  },
  {name: '個人賞ページ', routes: awardsRoutes, path: '/academy-director'},
  {name: '年一覧', routes: yearsRoutes, path: '/'},
  {name: '年別ページ', routes: yearsRoutes, path: '/1999'},
  {name: '賞の交差', routes: crossingsRoutes, path: '/'},
  {name: '無冠の映画', routes: uncrownedRoutes, path: '/'},
  {name: '観た映画チェックのリスト', routes: watchedRoutes, path: '/lists'},
  {
    name: '映画の候補',
    routes: searchRoutes,
    path: '/suggest?q=Beauty&locale=ja',
  },
  {
    name: '人物の候補',
    routes: searchRoutes,
    path: '/suggest?q=Mendes&locale=ja',
  },
  {name: '人物一覧', routes: peopleRoutes, path: '/?page=1&limit=10'},
  {
    name: '人物ランキング',
    routes: peopleRoutes,
    path: '/prominent?locale=ja&limit=5',
  },
  {name: '人物検索', routes: peopleRoutes, path: '/search?q=Hanks&locale=ja'},
  {
    name: '人物検索（受賞者）',
    routes: peopleRoutes,
    path: '/search?q=Mendes&locale=ja',
  },
  {name: '人物の交差', routes: peopleRoutes, path: '/crossings?locale=ja'},
  {name: '無冠の人物', routes: peopleRoutes, path: '/uncrowned?locale=ja'},
  {
    name: '人物詳細',
    routes: peopleRoutes,
    path: `/${seededPeopleUids.hanks}?locale=ja`,
  },
  {
    name: '人物詳細（監督）',
    routes: peopleRoutes,
    path: `/${seededPeopleUids.mendes}?locale=ja`,
  },
  {name: '映画検索', routes: moviesRoutes, path: '/search?q=Beauty'},
  {name: '映画の uid 一覧', routes: moviesRoutes, path: '/uids'},
  {name: '映画詳細', routes: moviesRoutes, path: '/movie-beauty?locale=ja'},
  {
    name: '関連映画',
    routes: moviesRoutes,
    path: '/movie-beauty/related?locale=ja',
  },
  {name: '日替わり選出', routes: selectionsRoutes, path: '/?locale=ja'},
  {
    name: '来月の選出',
    routes: selectionsRoutes,
    path: '/selections/monthly/next?locale=ja',
  },
  {
    name: '選出の履歴',
    routes: selectionsRoutes,
    path: '/selections/daily/history?locale=ja',
  },
  {name: 'クイズの出題', routes: quizRoutes, path: '/daily'},
];

type Puts = Array<{key: string; value: string}>;

function createRecordingKv(puts: Puts): KVNamespace {
  return {
    async get() {
      return null;
    },
    async put(key: string, value: string) {
      puts.push({key, value});
    },
    async delete() {},
  } as unknown as KVNamespace;
}

async function createSeededEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-shape-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await seedPublicData(database);
  return environment;
}

async function readRecord(): Promise<Record<string, string[]>> {
  try {
    return JSON.parse(await fs.readFile(recordPath, 'utf8')) as Record<
      string,
      string[]
    >;
  } catch {
    return {};
  }
}

const observed = new Map<string, string[]>();
const failures: CacheShapeCheck[] = [];
let ranExercises = 0;

describe('キャッシュ鍵の版', () => {
  let seededEnvironment: Environment;
  let recorded: Record<string, string[]>;

  beforeAll(async () => {
    seededEnvironment = await createSeededEnvironment();
    recorded = await readRecord();
  });

  afterAll(async () => {
    if (!isUpdating) {
      return;
    }

    if (observed.size === 0 || ranExercises < exercises.length) {
      throw new Error(
        `記録は全部の経路を通してから書く（走ったのは ${ranExercises}/${exercises.length}）。-t で絞らずに流すこと。`,
      );
    }

    const blocked = failures.filter(
      failure => !failure.ok && failure.reason === 'version-not-bumped',
    );
    if (blocked.length > 0) {
      throw new Error(
        [
          '版を上げずに記録だけ更新することはできない。',
          ...blocked.map(failure => (failure.ok ? '' : failure.message)),
        ].join('\n\n'),
      );
    }

    const merged = Object.fromEntries(
      [...observed].toSorted(([a], [b]) => (a < b ? -1 : Number(a > b))),
    );
    await fs.writeFile(recordPath, `${JSON.stringify(merged, undefined, 2)}\n`);
  });

  it.each(exercises)('$name', async exercise => {
    const puts: Puts = [];
    const environment: Environment = {
      ...seededEnvironment,
      CACHE_KV: createRecordingKv(puts),
    };
    const background: Array<Promise<unknown>> = [];
    const executionContext = {
      waitUntil(promise: Promise<unknown>) {
        background.push(promise);
      },
      passThroughOnException() {},
    } as ExecutionContext;

    const response = await exercise.routes.request(
      exercise.path,
      {},
      environment,
      executionContext,
    );
    await Promise.all(background);

    expect(response.status).toBe(200);
    expect(
      puts.length,
      `${exercise.name} がキャッシュを書いていない`,
    ).toBeGreaterThan(0);

    ranExercises++;
    const checks: CacheShapeCheck[] = [];
    for (const put of puts) {
      const key = normalizeCacheKey(put.key);
      const shape = describeShape(JSON.parse(put.value));
      observed.set(key, shape);
      checks.push(
        checkCacheShape(recorded[key] && {key, shape: recorded[key]}, {
          key,
          shape,
        }),
      );
    }

    failures.push(...checks.filter(check => !check.ok));

    if (isUpdating) {
      return;
    }

    expect(
      checks
        .filter(check => !check.ok)
        .map(check => (check.ok ? '' : check.message)),
      `記録の更新は ${UPDATE_COMMAND}`,
    ).toEqual([]);
  });
});
