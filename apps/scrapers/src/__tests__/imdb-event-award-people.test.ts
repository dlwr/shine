/* eslint-disable unicorn/no-null -- IMDbから収集したJSONはnullを含む */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  importImdbEventAward,
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventNomination,
} from '../imdb-event-award';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type TestDatabase = ReturnType<typeof getDatabase>;

const directorConfig: ImdbEventAwardConfig = {
  organizationName: 'Japan Academy Awards',
  organizationCountry: 'Japan',
  establishedYear: 1978,
  categoryName: '監督賞',
  ceremonyNumber: year => year - 1977,
  isCompetitionCategory: category => category === '監督賞',
  minimumFilmsPerEdition: 1,
  personRole: 'director',
};

const actorConfig: ImdbEventAwardConfig = {
  ...directorConfig,
  categoryName: '助演男優賞',
  isCompetitionCategory: category => category === '助演男優賞',
  personRole: 'actor',
};

function personNomination(
  imdbId: string,
  title: string,
  peopleNames: string[],
  isWinner = false,
): ImdbEventNomination {
  return {
    isWinner,
    notes: null,
    titles: [{imdbId, title, originalTitle: title}],
    people: peopleNames.map(name => ({name})),
  };
}

function collectedData(
  category: string,
  nominations_: ImdbEventNomination[],
): ImdbEventCollectedData {
  return {
    collectedAt: '2026-08-24',
    source: 'https://ja.wikipedia.org/wiki/日本アカデミー賞監督賞',
    editions: [
      {
        year: 2026,
        awardNames: [category],
        targetAward: [
          {categories: [{category, total: null, nominations: nominations_}]},
        ],
      },
    ],
  };
}

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: TestDatabase;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-people-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values({
    uid: 'movie-kokuho',
    imdbId: 'tt99999999',
    year: 2025,
  });
  await database.insert(people).values([
    {uid: 'person-lee', tmdbId: 1, name: '李相日'},
    {uid: 'person-watanabe', tmdbId: 2, name: '渡辺 謙'},
    {uid: 'person-yokohama', tmdbId: 3, name: 'Ryusei Yokohama'},
  ]);
  await database.insert(translations).values({
    resourceType: 'person_name',
    resourceUid: 'person-yokohama',
    languageCode: 'ja',
    content: '横浜流星',
  });
  await database.insert(movieCredits).values([
    {
      movieUid: 'movie-kokuho',
      personUid: 'person-lee',
      creditId: 'c1',
      department: 'Directing',
      job: 'Director',
    },
    {
      movieUid: 'movie-kokuho',
      personUid: 'person-watanabe',
      creditId: 'c2',
      department: 'Acting',
      castOrder: 1,
    },
    {
      movieUid: 'movie-kokuho',
      personUid: 'person-yokohama',
      creditId: 'c3',
      department: 'Acting',
      castOrder: 0,
    },
  ]);

  return {environment, database};
}

describe('importImdbEventAward の個人賞', () => {
  let environment: Environment;
  let database: TestDatabase;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  it('部門の短い名前を設定から保存する', async () => {
    await importImdbEventAward({
      environment,
      data: collectedData('監督賞', [
        personNomination('tt99999999', '国宝', ['李相日'], true),
      ]),
      config: {...directorConfig, categoryShortName: '監督'},
      throttleMs: 0,
    });

    const [category] = await database
      .select({shortName: awardCategories.shortName})
      .from(awardCategories);
    expect(category.shortName).toBe('監督');
  });

  it('人物ごとにノミネーションを作る', async () => {
    await importImdbEventAward({
      environment,
      data: collectedData('助演男優賞', [
        personNomination('tt99999999', '国宝', ['横浜流星', '渡辺謙']),
      ]),
      config: actorConfig,
      throttleMs: 0,
    });

    const rows = await database.select().from(nominations);
    expect(
      rows
        .map(row => row.personUid)
        .toSorted((a, b) => (a ?? '').localeCompare(b ?? '')),
    ).toEqual(['person-watanabe', 'person-yokohama']);
  });

  it('人物付きのときは作品だけのノミネーションを作らない', async () => {
    await importImdbEventAward({
      environment,
      data: collectedData('助演男優賞', [
        personNomination('tt99999999', '国宝', ['渡辺謙']),
      ]),
      config: actorConfig,
      throttleMs: 0,
    });

    const rows = await database
      .select()
      .from(nominations)
      .where(eq(nominations.movieUid, 'movie-kokuho'));
    expect(rows).toHaveLength(1);
  });

  it('受賞を人物ごとに保存する', async () => {
    await importImdbEventAward({
      environment,
      data: collectedData('監督賞', [
        personNomination('tt99999999', '国宝', ['李相日'], true),
      ]),
      config: directorConfig,
      throttleMs: 0,
    });

    const [row] = await database.select().from(nominations);
    expect(row.isWinner).toBe(1);
  });

  it('日本語名の翻訳でも人物を引き当てる', async () => {
    await importImdbEventAward({
      environment,
      data: collectedData('助演男優賞', [
        personNomination('tt99999999', '国宝', ['横浜流星']),
      ]),
      config: actorConfig,
      throttleMs: 0,
    });

    const [row] = await database.select().from(nominations);
    expect(row.personUid).toBe('person-yokohama');
  });

  it('名前の空白の違いを無視して引き当てる', async () => {
    await importImdbEventAward({
      environment,
      data: collectedData('助演男優賞', [
        personNomination('tt99999999', '国宝', ['渡辺謙']),
      ]),
      config: actorConfig,
      throttleMs: 0,
    });

    const [row] = await database.select().from(nominations);
    expect(row.personUid).toBe('person-watanabe');
  });

  it('監督賞では出演クレジットを引き当てない', async () => {
    const stats = await importImdbEventAward({
      environment,
      data: collectedData('監督賞', [
        personNomination('tt99999999', '国宝', ['渡辺謙']),
      ]),
      config: directorConfig,
      throttleMs: 0,
    });

    expect(await database.select().from(nominations)).toHaveLength(0);
    expect(stats.peopleUnresolved).toBe(1);
  });

  it('クレジットに無い人物は取り込まない', async () => {
    const stats = await importImdbEventAward({
      environment,
      data: collectedData('監督賞', [
        personNomination('tt99999999', '国宝', ['存在しない人']),
      ]),
      config: directorConfig,
      throttleMs: 0,
    });

    expect(await database.select().from(nominations)).toHaveLength(0);
    expect(stats.peopleUnresolved).toBe(1);
  });

  it('再実行しても二重に入らない', async () => {
    const data = collectedData('助演男優賞', [
      personNomination('tt99999999', '国宝', ['横浜流星', '渡辺謙']),
    ]);

    await importImdbEventAward({
      environment,
      data,
      config: actorConfig,
      throttleMs: 0,
    });
    await importImdbEventAward({
      environment,
      data,
      config: actorConfig,
      throttleMs: 0,
    });

    expect(await database.select().from(nominations)).toHaveLength(2);
  });

  it('後から受賞に昇格させる', async () => {
    await importImdbEventAward({
      environment,
      data: collectedData('監督賞', [
        personNomination('tt99999999', '国宝', ['李相日']),
      ]),
      config: directorConfig,
      throttleMs: 0,
    });
    await importImdbEventAward({
      environment,
      data: collectedData('監督賞', [
        personNomination('tt99999999', '国宝', ['李相日'], true),
      ]),
      config: directorConfig,
      throttleMs: 0,
    });

    const rows = await database.select().from(nominations);
    expect(rows).toHaveLength(1);
    expect(rows[0].isWinner).toBe(1);
  });
});

describe('importImdbEventAward の個人賞 TMDbフォールバック', () => {
  let environment: Environment;
  let database: TestDatabase;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
    environment.TMDB_API_KEY = 'test-key';
    await database
      .update(movies)
      .set({tmdbId: 4242})
      .where(eq(movies.uid, 'movie-kokuho'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          cast: [
            {
              id: 9001,
              credit_id: 'tmdb-credit-1',
              name: '田中泯',
              original_name: 'Min Tanaka',
              character: '小野川万菊',
              order: 28,
              profile_path: '/min.jpg',
            },
          ],
          crew: [],
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('保存済みクレジットに居ない人物をTMDbの全キャストから引き当てる', async () => {
    await importImdbEventAward({
      environment,
      data: collectedData('助演男優賞', [
        personNomination('tt99999999', '国宝', ['田中泯']),
      ]),
      config: actorConfig,
      throttleMs: 0,
    });

    const [row] = await database.select().from(nominations);
    expect(row?.personUid).toBeTruthy();
  });

  it('引き当てた人物のクレジットを1件だけ足す', async () => {
    await importImdbEventAward({
      environment,
      data: collectedData('助演男優賞', [
        personNomination('tt99999999', '国宝', ['田中泯']),
      ]),
      config: actorConfig,
      throttleMs: 0,
    });

    const credits = await database
      .select()
      .from(movieCredits)
      .where(eq(movieCredits.movieUid, 'movie-kokuho'));
    expect(credits).toHaveLength(4);
    expect(credits.some(credit => credit.creditId === 'tmdb-credit-1')).toBe(
      true,
    );
  });

  it('TMDbの全キャストにも居なければ取り込まない', async () => {
    const stats = await importImdbEventAward({
      environment,
      data: collectedData('助演男優賞', [
        personNomination('tt99999999', '国宝', ['居ない俳優']),
      ]),
      config: actorConfig,
      throttleMs: 0,
    });

    expect(await database.select().from(nominations)).toHaveLength(0);
    expect(stats.peopleUnresolved).toBe(1);
  });
});
