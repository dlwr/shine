import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {Environment} from '@shine/database';
import {createD1TestDatabase} from '@shine/database/testing';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {moviesRoutes} from '../routes/movies';
import {AwardsService} from '../services/awards-service';
import {CrossingsService} from '../services/crossings-service';
import {MoviesService} from '../services/movies-service';
import {PeopleService} from '../services/people-service';
import {PersonAwardsService} from '../services/person-awards-service';
import {PersonCrossingsService} from '../services/person-crossings-service';
import {PersonUncrownedService} from '../services/person-uncrowned-service';
import {QuizService} from '../services/quiz-service';
import {SelectionsService} from '../services/selections-service';
import {UncrownedService} from '../services/uncrowned-service';
import {WatchedService} from '../services/watched-service';
import {YearsService} from '../services/years-service';
import {seededPeopleUids, seedPublicData} from './public-data-seed';

type Statement = {sql: string; args: unknown[]};
type PlanRow = {id: number; parent: number; detail: string};

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

function capturing(d1: D1Database, captured: Statement[]): D1Database {
  return new Proxy(d1, {
    get(target, property, receiver) {
      if (property !== 'prepare') {
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      }

      return (sql: string) => {
        const statement: Statement = {sql, args: []};
        captured.push(statement);
        return new Proxy(target.prepare(sql), {
          get(prepared, preparedProperty, preparedReceiver) {
            const value: unknown = Reflect.get(
              prepared,
              preparedProperty,
              preparedReceiver,
            );
            if (typeof value !== 'function') {
              return value;
            }

            if (preparedProperty !== 'bind') {
              return value.bind(prepared);
            }

            return (...arguments_: unknown[]) => {
              statement.args = arguments_;
              return prepared.bind(...arguments_);
            };
          },
        });
      };
    },
  });
}

function createMemoryKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: string | {type?: string}) {
      const raw = store.get(key);
      if (raw === undefined) {
        return null;
      }

      return type === 'json' ||
        (typeof type === 'object' && type.type === 'json')
        ? JSON.parse(raw)
        : raw;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

async function explain(
  d1: D1Database,
  statement: Statement,
): Promise<PlanRow[]> {
  const result = await d1
    .prepare(`EXPLAIN QUERY PLAN ${statement.sql}`)
    .bind(...statement.args)
    .all<PlanRow>();
  return result.results.map(row => ({
    id: Number(row.id),
    parent: Number(row.parent),
    detail: String(row.detail),
  }));
}

function isUnderCorrelatedSubquery(rows: PlanRow[], row: PlanRow): boolean {
  const byId = new Map(rows.map(current => [current.id, current]));
  let parent = byId.get(row.parent);
  while (parent) {
    if (parent.detail.startsWith('CORRELATED')) {
      return true;
    }

    parent = byId.get(parent.parent);
  }

  return false;
}

function isFullScan(row: PlanRow): boolean {
  return (
    (row.detail.startsWith('SCAN ') &&
      !/ VIRTUAL TABLE INDEX \d+:M/.test(row.detail)) ||
    /^SEARCH movies USING (?:COVERING )?INDEX \S+ \(deleted_at=\?\)$/.test(
      row.detail,
    )
  );
}

function fullScans(rows: PlanRow[]): string[] {
  return rows.filter(row => isFullScan(row)).map(row => row.detail);
}

function fullScansPerRow(rows: PlanRow[]): string[] {
  return rows
    .filter(row => isFullScan(row) && isUnderCorrelatedSubquery(rows, row))
    .map(row => row.detail);
}

type Exercise = {
  name: string;
  run: (environment: Environment) => Promise<unknown>;
  indexOnly?: boolean;
};

const exercises: Exercise[] = [
  {
    name: '映画詳細',
    run: environment =>
      new MoviesService(environment).getMovieDetails('movie-beauty', 'ja'),
    indexOnly: true,
  },
  {
    name: '関連映画',
    run: async environment =>
      moviesRoutes.request('/movie-beauty/related?locale=ja', {}, environment),
    indexOnly: true,
  },
  {
    name: '映画の uid 一覧',
    run: environment => new MoviesService(environment).listMovieUids(),
  },
  {
    name: '検索語なしの映画検索',
    run: environment =>
      new MoviesService(environment).searchMovies({page: 1, limit: 100}),
  },
  {
    name: '検索語つきの映画検索',
    run: environment =>
      new MoviesService(environment).searchMovies({
        page: 1,
        limit: 20,
        query: 'Mendes',
      }),
  },
  {
    name: '映画の候補',
    run: environment =>
      new MoviesService(environment).suggestMovies('Beauty', 5),
  },
  {
    name: '受賞ありの映画検索',
    run: environment =>
      new MoviesService(environment).searchMovies({
        page: 1,
        limit: 20,
        hasAwards: true,
      }),
  },
  {
    name: '人物詳細',
    run: environment =>
      new PeopleService(environment).getPerson(seededPeopleUids.hanks, 'ja'),
    indexOnly: true,
  },
  {
    name: '人物一覧',
    run: environment =>
      new PeopleService(environment).listPeople({page: 1, limit: 50}),
  },
  {
    name: '人物ランキング',
    run: environment =>
      new PeopleService(environment).getProminentPeople({locale: 'ja'}),
  },
  {
    name: '人物検索',
    run: environment =>
      new PeopleService(environment).searchPeople({
        query: 'Hanks',
        locale: 'ja',
      }),
  },
  {
    name: '賞一覧',
    run: environment => new AwardsService(environment).listAwards(),
  },
  {
    name: '賞ページ',
    run: environment =>
      new AwardsService(environment).getAwardBySlug('academy-best-picture'),
  },
  {
    name: '賞の年別ページ',
    run: environment =>
      new AwardsService(environment).getAwardYear('academy-best-picture', 2000),
    indexOnly: true,
  },
  {
    name: '個人賞ページ',
    run: environment =>
      new PersonAwardsService(environment).getPersonAwardBySlug(
        'academy-director',
      ),
  },
  {
    name: '年一覧',
    run: environment => new YearsService(environment).listYears(),
  },
  {
    name: '年別ページ',
    run: environment => new YearsService(environment).getYear(1999),
  },
  {
    name: '賞の交差',
    run: environment => new CrossingsService(environment).getCrossings(),
  },
  {
    name: '無冠の映画',
    run: environment => new UncrownedService(environment).getUncrowned(),
  },
  {
    name: '人物の交差',
    run: environment =>
      new PersonCrossingsService(environment).getPersonCrossings({
        locale: 'ja',
      }),
  },
  {
    name: '無冠の人物',
    run: environment =>
      new PersonUncrownedService(environment).getPersonUncrowned({
        locale: 'ja',
      }),
  },
  {
    name: 'クイズの出題候補',
    run: environment => new QuizService(environment).getPool(),
  },
  {
    name: 'クイズの出題',
    run: environment =>
      new QuizService(environment).getEntry(
        new Date().toISOString().slice(0, 10),
      ),
  },
  {
    name: '観た映画チェックのリスト',
    run: environment => new WatchedService(environment).listWatchedLists(),
  },
  {
    name: '日替わり選出',
    run: environment =>
      new SelectionsService(environment).getDateSeededSelections({
        locale: 'ja',
      }),
  },
  {
    name: '来月の選出',
    run: environment =>
      new SelectionsService(environment).getNextSelection('monthly', 'ja'),
  },
];

describe('公開エンドポイントの実行計画', () => {
  const captured: Statement[] = [];
  let binding: D1Database;
  let dispose: (() => Promise<void>) | undefined;
  let environment: Environment;

  beforeAll(async () => {
    const d1 = await createD1TestDatabase({migrationsFolder});
    binding = d1.binding;
    dispose = d1.dispose;
    await seedPublicData(d1.database);
  }, 60_000);

  afterAll(async () => {
    await dispose?.();
  });

  beforeEach(() => {
    environment = {
      DB: capturing(binding, captured),
      CACHE_KV: createMemoryKv(),
    };
    captured.length = 0;
  });

  async function plansOf(exercise: Exercise): Promise<Map<string, PlanRow[]>> {
    await exercise.run(environment);
    const statements = [...captured];
    captured.length = 0;
    expect(statements.length).toBeGreaterThan(0);

    const plans = new Map<string, PlanRow[]>();
    for (const statement of statements) {
      if (!plans.has(statement.sql)) {
        plans.set(statement.sql, await explain(binding, statement));
      }
    }

    return plans;
  }

  it.each(exercises)(
    '$name は行ごとのサブクエリで全件走査をしない',
    async exercise => {
      const plans = await plansOf(exercise);
      for (const [statement, plan] of plans) {
        expect(fullScansPerRow(plan), statement).toEqual([]);
      }
    },
  );

  it('人物検索は一致した人物の分だけ受賞を集計する', async () => {
    const exercise = exercises.find(current => current.name === '人物検索');
    const plans = await plansOf(exercise!);
    for (const [statement, plan] of plans) {
      expect(
        plan.filter(row => row.detail.startsWith('MATERIALIZE')),
        statement,
      ).toEqual([]);
      expect(fullScans(plan), statement).toEqual([]);
      if (!statement.includes('from "people"')) {
        continue;
      }

      expect(
        plan
          .filter(row => isUnderCorrelatedSubquery(plan, row))
          .filter(row =>
            row.detail.endsWith('(resource_type=? AND resource_uid=?)'),
          ),
        `${statement} 人物名の一致を人物ごとに探している`,
      ).toEqual([]);
    }
  });

  it.each(['検索語つきの映画検索', '映画の候補'])(
    '%s は検索語の一致を索引で引く',
    async name => {
      const exercise = exercises.find(current => current.name === name);
      const plans = await plansOf(exercise!);
      for (const [statement, plan] of plans) {
        expect(fullScans(plan), statement).toEqual([]);
      }
    },
  );

  it('関連映画は受賞作を部門と受賞の索引で引く', async () => {
    const exercise = exercises.find(current => current.name === '関連映画');
    const plans = await plansOf(exercise!);
    const details = plans
      .values()
      .toArray()
      .flat()
      .map(row => row.detail);
    expect(details).toContainEqual(
      expect.stringMatching(
        /^SEARCH nominations USING (?:COVERING )?INDEX nominations_category_winner_idx \(category_uid=\? AND is_winner=\?\)$/,
      ),
    );
  });

  it.each(exercises.filter(exercise => exercise.indexOnly))(
    '$name は索引だけで引く',
    async exercise => {
      const plans = await plansOf(exercise);
      for (const [statement, plan] of plans) {
        expect(fullScans(plan), statement).toEqual([]);
      }
    },
  );
});
