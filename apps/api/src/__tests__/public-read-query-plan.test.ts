import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {moviesRoutes} from '../routes/movies';
import {AwardsService} from '../services/awards-service';
import {CrossingsService} from '../services/crossings-service';
import {MoviesService} from '../services/movies-service';
import {PeopleService} from '../services/people-service';
import {PersonCrossingsService} from '../services/person-crossings-service';
import {PersonUncrownedService} from '../services/person-uncrowned-service';
import {QuizService} from '../services/quiz-service';
import {SelectionsService} from '../services/selections-service';
import {UncrownedService} from '../services/uncrowned-service';
import {YearsService} from '../services/years-service';

type Database = ReturnType<typeof getDatabase>;
type Client = Database['$client'];
type Statement = Extract<Parameters<Client['batch']>[0][number], {sql: string}>;
type PlanRow = {id: number; parent: number; detail: string};

const {captured} = vi.hoisted(() => ({captured: [] as Statement[]}));

vi.mock('@shine/database', async importOriginal => {
  const original = await importOriginal<typeof import('@shine/database')>();
  return {
    ...original,
    getDatabase(environment: Environment) {
      const database = original.getDatabase(environment);
      const client = database.$client;
      const execute = client.execute.bind(client);
      client.execute = ((statement: Statement | string) => {
        captured.push(
          typeof statement === 'string' ? {sql: statement} : statement,
        );
        return execute(statement);
      }) as Client['execute'];
      return database;
    },
  };
});

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-plan-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await seed(database);
  return environment;
}

async function seed(database: Database): Promise<void> {
  await database
    .insert(awardOrganizations)
    .values({uid: 'org-academy', name: 'Academy Awards'});
  await database.insert(awardCategories).values([
    {
      uid: 'cat-picture',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Picture',
    },
    {
      uid: 'cat-director',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Director',
    },
    {
      uid: 'cat-actor',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Actor',
    },
  ]);
  await database.insert(awardCeremonies).values([
    {
      uid: 'ceremony-2000',
      organizationUid: 'org-academy',
      year: 2000,
      ceremonyNumber: 72,
    },
    {
      uid: 'ceremony-2001',
      organizationUid: 'org-academy',
      year: 2001,
      ceremonyNumber: 73,
    },
  ]);
  await database.insert(movies).values([
    {uid: 'movie-beauty', year: 1999, originalLanguage: 'en'},
    {uid: 'movie-green', year: 1999, originalLanguage: 'en'},
    {uid: 'movie-gladiator', year: 2000, originalLanguage: 'en'},
    {
      uid: 'movie-deleted',
      year: 2000,
      originalLanguage: 'en',
      deletedAt: 1_700_000_000,
    },
  ]);
  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-beauty',
      languageCode: 'en',
      content: 'American Beauty',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-beauty',
      languageCode: 'ja',
      content: 'アメリカン・ビューティー',
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-green',
      languageCode: 'en',
      content: 'The Green Mile',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-gladiator',
      languageCode: 'en',
      content: 'Gladiator',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-gladiator',
      languageCode: 'ja',
      content: 'グラディエーター',
    },
    {
      resourceType: 'person_name',
      resourceUid: 'person-hanks',
      languageCode: 'ja',
      content: 'トム・ハンクス',
    },
  ]);
  await database.insert(posterUrls).values({
    movieUid: 'movie-beauty',
    url: 'https://example.com/beauty.jpg',
    isPrimary: 1,
  });
  await database.insert(articleLinks).values({
    movieUid: 'movie-beauty',
    url: 'https://example.com/beauty',
    title: 'Review',
  });
  await database.insert(people).values([
    {uid: 'person-mendes', tmdbId: 1, name: 'Sam Mendes'},
    {uid: 'person-spacey', tmdbId: 2, name: 'Kevin Spacey'},
    {uid: 'person-hanks', tmdbId: 3, name: 'Tom Hanks'},
  ]);
  await database.insert(movieCredits).values([
    {
      movieUid: 'movie-beauty',
      personUid: 'person-mendes',
      creditId: 'credit-1',
      department: 'Directing',
      job: 'Director',
    },
    {
      movieUid: 'movie-beauty',
      personUid: 'person-spacey',
      creditId: 'credit-2',
      department: 'Acting',
      character: 'Lester Burnham',
      castOrder: 0,
    },
    {
      movieUid: 'movie-green',
      personUid: 'person-hanks',
      creditId: 'credit-3',
      department: 'Acting',
      character: 'Paul Edgecomb',
      castOrder: 0,
    },
    {
      movieUid: 'movie-gladiator',
      personUid: 'person-hanks',
      creditId: 'credit-4',
      department: 'Acting',
      character: 'Narrator',
      castOrder: 1,
    },
  ]);
  await database.insert(nominations).values([
    {
      movieUid: 'movie-beauty',
      ceremonyUid: 'ceremony-2000',
      categoryUid: 'cat-picture',
      isWinner: 1,
    },
    {
      movieUid: 'movie-green',
      ceremonyUid: 'ceremony-2000',
      categoryUid: 'cat-picture',
      isWinner: 0,
    },
    {
      movieUid: 'movie-beauty',
      ceremonyUid: 'ceremony-2000',
      categoryUid: 'cat-director',
      personUid: 'person-mendes',
      isWinner: 1,
    },
    {
      movieUid: 'movie-beauty',
      ceremonyUid: 'ceremony-2000',
      categoryUid: 'cat-actor',
      personUid: 'person-spacey',
      isWinner: 1,
    },
    {
      movieUid: 'movie-green',
      ceremonyUid: 'ceremony-2000',
      categoryUid: 'cat-actor',
      personUid: 'person-hanks',
      isWinner: 0,
    },
    {
      movieUid: 'movie-gladiator',
      ceremonyUid: 'ceremony-2001',
      categoryUid: 'cat-picture',
      isWinner: 1,
    },
    {
      movieUid: 'movie-gladiator',
      ceremonyUid: 'ceremony-2001',
      categoryUid: 'cat-actor',
      personUid: 'person-hanks',
      isWinner: 0,
    },
  ]);
}

function createMemoryKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const raw = store.get(key);
      if (raw === undefined) {
        // eslint-disable-next-line unicorn/no-null -- KVNamespace.get returns null for missing keys
        return null;
      }

      return type === 'json' ? JSON.parse(raw) : raw;
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
  client: Client,
  statement: Statement,
): Promise<PlanRow[]> {
  const result = await client.execute({
    sql: `EXPLAIN QUERY PLAN ${statement.sql}`,
    args: statement.args,
  });
  return result.rows.map(row => ({
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

function fullScans(rows: PlanRow[]): string[] {
  return rows
    .filter(row => row.detail.startsWith('SCAN '))
    .map(row => row.detail);
}

function fullScansPerRow(rows: PlanRow[]): string[] {
  return rows
    .filter(
      row =>
        row.detail.startsWith('SCAN ') && isUnderCorrelatedSubquery(rows, row),
    )
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
      new PeopleService(environment).getPerson('person-hanks', 'ja'),
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
      new AwardsService(environment).getPersonAwardBySlug('academy-director'),
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
    name: '日替わり選出',
    run: environment =>
      new SelectionsService(environment).getDateSeededSelections({
        locale: 'ja',
      }),
  },
];

describe('公開エンドポイントの実行計画', () => {
  let seededEnvironment: Environment;
  let environment: Environment;
  let client: Client;

  beforeAll(async () => {
    seededEnvironment = await createTestEnvironment();
    client = getDatabase(seededEnvironment).$client;
  });

  beforeEach(() => {
    environment = {...seededEnvironment, CACHE_KV: createMemoryKv()};
    captured.length = 0;
  });

  async function plansOf(exercise: Exercise): Promise<Map<string, PlanRow[]>> {
    await exercise.run(environment);
    const statements = [...captured];
    captured.length = 0;
    expect(statements.length).toBeGreaterThan(0);

    const plans = new Map<string, PlanRow[]>();
    for (const statement of statements) {
      plans.set(statement.sql, await explain(client, statement));
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
