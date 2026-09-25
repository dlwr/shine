import type {Environment} from '@shine/database';
import {AwardsService} from '../services/awards-service';
import {MoviesService} from '../services/movies-service';
import {loadPersonDetail} from '../services/person-detail';
import {getDatabase} from '@shine/database';
import {YearsService} from '../services/years-service';

const BENCH_ENDS_AT = Date.parse('2026-10-01T00:00:00Z');

type BenchEnvironment = Environment & {DB: D1Database; BENCH_KEY: string};

const PEOPLE = [
  'b098f881-6434-4d8d-bbf4-26452fc42a34',
  'c7a26010-8c40-40d9-b3e7-c87ae3fe1d5a',
  'decf579c-94cf-401d-84c9-a9815f212257',
  '6a9cb44b-4173-475c-93d7-14d042b5c5f7',
  'c0a960d7-1be1-4c54-a636-3ed126ee24c3',
  '02461dec-9cb3-4e6b-924c-4491372947f7',
  '207d257e-b4a8-45ef-9a55-aceb461ff59e',
  'bc2c4826-2a1c-4840-ab27-f18be02224d2',
  '041f5650-e82c-4d13-a583-941727e50576',
  '9d82a9d3-8802-47fd-b54d-d32cc93b648c',
  '2f08f41d-3881-4e2a-a93e-7622da3ca52e',
  '8f0329a5-bf68-469f-90e2-caf2e643e65e',
  'd3a701f9-65cf-4a61-9df5-859918e4c1a8',
  'd812378d-5b95-4004-86bf-63ea45eefd5c',
  '72e7149f-d24c-497d-8b5a-4b9c86826019',
  '0531c756-946f-4633-9659-4d0860dd474f',
  '6f8c3c73-dc11-46b7-92f1-d217ce094a18',
  '87adbae7-4032-4cca-8e2f-11ab0315322a',
  '1e8c94e8-4ab9-4c33-b19d-b710c4a04867',
  '16ac50fc-0392-4f6d-b4ee-11ba41c9d48b',
];

const MOVIES = [
  '30cdb905-bc09-49ef-aefc-9e66fc0b6652',
  '775e52f4-3b5e-48da-8ab5-b9bf210479f1',
  'd76c0c46-0727-4bcc-a413-5270058249d3',
  '88185316-4741-4003-96dd-991247a8e304',
  'd0d81b9c-a51a-4181-a99a-dc27cd0e9ca6',
  '13b6bf13-36c4-42cd-90db-3c4eb0c13745',
  '9e8fbc4e-efbe-4550-acac-0b7dd8aaf567',
  '2029588e-89e9-4508-84c7-17b33bb10445',
  '159599aa-4eec-4783-a564-09ba63ed0b9b',
  'a26eb411-3098-4875-98f2-5f333db8bd16',
  'b212ade2-addb-4477-91eb-7ce8deb060c9',
  'cd8fdc1e-08ef-41ad-8a07-191457c99823',
  'a0710db7-1937-4853-83cd-4303660f29ae',
  'e41a22da-253f-4934-a731-83b57be90b09',
  '6c98183c-a6a7-4af4-a7b3-8fa462d51a8c',
  'b8d2ae0d-7987-4ac6-9fd1-a8635845b325',
  '76d6cec7-3384-4d76-be43-0380d246b6e5',
  '9b56fe26-eb91-4be2-b2ac-2743e0ee928c',
  'ecfa790a-a651-40a1-9c91-8703111362f0',
  'ee20d097-1d32-471c-989a-8f34cb3310ab',
];

const QUERIES = ['東京', '黒澤', '夏', 'ゴジラ', 'love', '北野', '山田', '海'];
const SLUGS = ['academy-best-picture', 'palme-dor', 'berlin-golden-bear'];
const YEARS = [1960, 1985, 1999, 2010, 2024];

const pick = <T>(values: readonly T[]): T =>
  values[Math.floor(Math.random() * values.length)];

type Scenario = {
  name: string;
  run: (environment: Environment) => Promise<unknown>;
};

const scenarios = (): Scenario[] => {
  const person = pick(PEOPLE);
  const movie = pick(MOVIES);
  const query = pick(QUERIES);
  const slug = pick(SLUGS);
  const year = pick(YEARS);
  return [
    {
      name: 'person',
      run: async environment =>
        loadPersonDetail(getDatabase(environment), person, 'ja'),
    },
    {
      name: 'movie',
      run: async environment =>
        new MoviesService(environment).getMovieDetails(movie, 'ja'),
    },
    {
      name: 'search',
      run: async environment =>
        new MoviesService(environment).searchMovies({
          query,
          page: 1,
          limit: 20,
        }),
    },
    {
      name: 'award',
      run: async environment =>
        new AwardsService(environment).getAwardBySlug(slug),
    },
    {
      name: 'year',
      run: async environment => new YearsService(environment).getYear(year),
    },
  ];
};

type Sample = {
  backend: string;
  scenario: string;
  ms: number;
  ok: number;
  error: string | null;
};

const measure = async (
  backend: string,
  environment: Environment,
  scenario: Scenario,
): Promise<Sample> => {
  const started = performance.now();
  try {
    await scenario.run(environment);
    return {
      backend,
      scenario: scenario.name,
      ms: performance.now() - started,
      ok: 1,
      error: null,
    };
  } catch (error) {
    return {
      backend,
      scenario: scenario.name,
      ms: performance.now() - started,
      ok: 0,
      error: String(error).slice(0, 300),
    };
  }
};

const detectColo = async (): Promise<string> => {
  try {
    const response = await fetch('https://www.cloudflare.com/cdn-cgi/trace');
    const text = await response.text();
    return /colo=(\w+)/.exec(text)?.[1] ?? 'unknown';
  } catch {
    return 'unknown';
  }
};

const runBench = async (
  environment: BenchEnvironment,
  trigger: string,
  colo: string,
): Promise<Sample[]> => {
  const tursoEnvironment: Environment = {
    TURSO_DATABASE_URL: environment.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: environment.TURSO_AUTH_TOKEN,
    TURSO_REQUEST_TIMEOUT_MS: environment.TURSO_REQUEST_TIMEOUT_MS,
  };
  const d1Environment: Environment = {
    TURSO_DATABASE_URL: '',
    TURSO_AUTH_TOKEN: '',
    DB: environment.DB,
  };
  const samples: Sample[] = [];
  const isTursoFirst = Math.random() < 0.5;
  for (const scenario of scenarios()) {
    const pair = isTursoFirst
      ? [
          await measure('turso', tursoEnvironment, scenario),
          await measure('d1', d1Environment, scenario),
        ]
      : [
          await measure('d1', d1Environment, scenario),
          await measure('turso', tursoEnvironment, scenario),
        ];
    samples.push(...pair);
  }

  const now = Math.floor(Date.now() / 1000);
  await environment.DB.batch(
    samples.map(sample =>
      environment.DB.prepare(
        'INSERT INTO poc_bench (ts, trigger, colo, backend, scenario, ms, ok, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        now,
        trigger,
        colo,
        sample.backend,
        sample.scenario,
        Math.round(sample.ms),
        sample.ok,
        sample.error,
      ),
    ),
  );
  return samples;
};

export default {
  async scheduled(controller, environment, context) {
    if (controller.scheduledTime >= BENCH_ENDS_AT) {
      return;
    }

    context.waitUntil(
      (async () => runBench(environment, 'cron', await detectColo()))(),
    );
  },
  async fetch(request, environment) {
    if (
      Date.now() >= BENCH_ENDS_AT ||
      request.headers.get('x-bench-key') !== environment.BENCH_KEY
    ) {
      return new Response('forbidden', {status: 403});
    }

    const colo = (request.cf?.colo as string | undefined) ?? 'unknown';
    const samples = await runBench(environment, 'manual', colo);
    return Response.json({colo, samples});
  },
} satisfies ExportedHandler<BenchEnvironment>;
