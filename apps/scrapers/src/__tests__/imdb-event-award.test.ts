/* eslint-disable unicorn/no-null -- IMDbから収集したJSONはnullを含む */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {and, eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  extractAwardEditions,
  importImdbEventAward,
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventEdition,
  type ImdbEventNomination,
} from '../imdb-event-award';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const testConfig: ImdbEventAwardConfig = {
  organizationName: 'Test Film Festival',
  organizationCountry: 'Italy',
  establishedYear: 1932,
  categoryName: 'Test Award',
  ceremonyNumber: year => year - 1939,
  isCompetitionCategory: category =>
    category === null || category === 'Best Film',
  minimumFilmsPerEdition: 2,
};

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: ReturnType<typeof getDatabase>;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-imdb-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return {environment, database};
}

function nomination(
  imdbId: string,
  originalTitle: string,
  isWinner = false,
): ImdbEventNomination {
  return {
    isWinner,
    notes: null,
    titles: [{imdbId, title: originalTitle, originalTitle}],
  };
}

function edition(
  year: number,
  nominations_: ImdbEventNomination[],
  category: string | null = null,
): ImdbEventEdition {
  return {
    year,
    awardNames: ['Test Award'],
    targetAward: [
      {
        categories: [{category, total: null, nominations: nominations_}],
      },
    ],
  };
}

function collectedData(editions: ImdbEventEdition[]): ImdbEventCollectedData {
  return {
    collectedAt: '2026-08-14',
    source: 'https://www.imdb.com/event/ev0000000/',
    editions,
  };
}

const basicData = () =>
  collectedData([
    edition(1951, [
      nomination('tt0042876', 'Rashômon', true),
      nomination('tt0043338', 'Ace in the Hole'),
    ]),
    edition(2026, [
      nomination('tt37967547', 'Ink'),
      nomination('tt31434639', 'La Grazia'),
    ]),
  ]);

describe('extractAwardEditions', () => {
  it('targetAwardが空の回は除外する', () => {
    const data = collectedData([
      {year: 1946, awardNames: ['ANICA Cup'], targetAward: []},
      edition(1951, [
        nomination('tt0042876', 'Rashômon', true),
        nomination('tt0043338', 'Ace in the Hole'),
      ]),
    ]);

    const editions = extractAwardEditions(data, testConfig);

    expect(editions.map(entry => entry.year)).toEqual([1951]);
  });

  it('設定が除外するカテゴリを取り込まない', () => {
    const data = collectedData([
      {
        year: 2018,
        awardNames: ['Test Award'],
        targetAward: [
          {
            categories: [
              {
                category: 'Best Film',
                total: null,
                nominations: [
                  nomination('tt6155172', 'Roma', true),
                  nomination('tt5342766', 'The Favourite'),
                ],
              },
              {
                category: 'Immersive VR',
                total: null,
                nominations: [nomination('tt7918178', 'Spheres', true)],
              },
            ],
          },
        ],
      },
    ]);

    const editions = extractAwardEditions(data, testConfig);

    expect(editions[0].films.map(film => film.imdbId)).toEqual([
      'tt6155172',
      'tt5342766',
    ]);
  });

  it('複数の対象カテゴリを1つの回にまとめる', () => {
    const data = collectedData([
      {
        year: 1957,
        awardNames: ['Test Award'],
        targetAward: [
          {
            categories: [
              {
                category: null,
                total: null,
                nominations: [
                  nomination('tt0048956', 'Aparajito', true),
                  nomination('tt0050126', 'Bitter Victory'),
                ],
              },
              {
                category: 'Best Film',
                total: null,
                nominations: [nomination('tt0050850', 'Porte des Lilas')],
              },
            ],
          },
        ],
      },
    ]);

    const editions = extractAwardEditions(data, testConfig);

    expect(editions[0].films).toHaveLength(3);
  });

  it('タイトルが空のノミネーション（Not awardedマーカー）を除外する', () => {
    const data = collectedData([
      edition(1953, [
        {isWinner: true, notes: 'Not awarded.', titles: []},
        nomination('tt0046250', 'Roman Holiday'),
        nomination('tt0046478', 'Ugetsu monogatari'),
      ]),
    ]);

    const editions = extractAwardEditions(data, testConfig);

    expect(editions[0].films).toHaveLength(2);
    expect(editions[0].films.every(film => !film.isWinner)).toBe(true);
  });

  it('同一imdbIdの重複を除去しisWinnerをORで残す', () => {
    const data = collectedData([
      edition(1960, [
        {
          isWinner: false,
          notes: null,
          titles: [
            {
              imdbId: 'tt0053628',
              title: 'Baltiyskoe nebo',
              originalTitle: 'Baltiyskoe nebo',
            },
            {
              imdbId: 'tt0053628',
              title: 'Baltiyskoe nebo',
              originalTitle: 'Baltiyskoe nebo',
            },
          ],
        },
        nomination('tt0053946', 'Le passage du Rhin', true),
        nomination('tt0053946', 'Le passage du Rhin'),
      ]),
    ]);

    const editions = extractAwardEditions(data, testConfig);

    expect(editions[0].films).toHaveLength(2);
    const winner = editions[0].films.find(film => film.imdbId === 'tt0053946');
    expect(winner?.isWinner).toBe(true);
  });

  it('minimumFilmsPerEditionに満たない回を除外する', () => {
    const data = collectedData([
      edition(1979, [nomination('tt0078978', 'Clair de femme')]),
      edition(1980, [
        nomination('tt0080749', 'Gloria', true),
        nomination('tt0080388', 'Atlantic City', true),
      ]),
    ]);

    const editions = extractAwardEditions(data, testConfig);

    expect(editions.map(entry => entry.year)).toEqual([1980]);
  });

  it('winnerCorrectionsで誤った受賞フラグを訂正する', () => {
    const data = collectedData([
      edition(2006, [
        nomination('tt0430576', 'Grbavica', true),
        nomination('tt0445620', 'Paradise Now', true),
      ]),
    ]);

    const editions = extractAwardEditions(data, {
      ...testConfig,
      winnerCorrections: [{year: 2006, imdbId: 'tt0445620', isWinner: false}],
    });

    const films = editions[0].films;
    expect(films).toHaveLength(2);
    expect(films.find(film => film.imdbId === 'tt0445620')?.isWinner).toBe(
      false,
    );
    expect(films.find(film => film.imdbId === 'tt0430576')?.isWinner).toBe(
      true,
    );
  });

  it('winnerCorrectionsは指定年以外に影響しない', () => {
    const data = collectedData([
      edition(2005, [
        nomination('tt0445620', 'Paradise Now', true),
        nomination('tt0430576', 'Grbavica'),
      ]),
    ]);

    const editions = extractAwardEditions(data, {
      ...testConfig,
      winnerCorrections: [{year: 2006, imdbId: 'tt0445620', isWinner: false}],
    });

    expect(
      editions[0].films.find(film => film.imdbId === 'tt0445620')?.isWinner,
    ).toBe(true);
  });

  it('minimumFilmsPerEditionが1なら1作品だけの回も残す', () => {
    const data = collectedData([
      edition(1953, [nomination('tt0046268', 'Le salaire de la peur', true)]),
    ]);

    const editions = extractAwardEditions(data, {
      ...testConfig,
      minimumFilmsPerEdition: 1,
    });

    expect(editions).toHaveLength(1);
    expect(editions[0].films[0].isWinner).toBe(true);
  });
});

describe('importImdbEventAward', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('組織・カテゴリ・回次付きセレモニーを作成する', async () => {
    await importImdbEventAward({
      environment,
      data: basicData(),
      config: testConfig,
    });

    const [organization] = await database
      .select()
      .from(awardOrganizations)
      .where(eq(awardOrganizations.name, 'Test Film Festival'));
    expect(organization.country).toBe('Italy');
    expect(organization.establishedYear).toBe(1932);

    const [category] = await database
      .select()
      .from(awardCategories)
      .where(eq(awardCategories.organizationUid, organization.uid));
    expect(category.name).toBe('Test Award');

    const ceremonies = await database
      .select()
      .from(awardCeremonies)
      .where(eq(awardCeremonies.organizationUid, organization.uid));
    const byYear = new Map(ceremonies.map(row => [row.year, row]));
    expect(byYear.get(1951)?.ceremonyNumber).toBe(12);
    expect(byYear.get(2026)?.ceremonyNumber).toBe(87);
  });

  it('回次が未定義の年でもセレモニーを作成する', async () => {
    await importImdbEventAward({
      environment,
      data: basicData(),
      config: {
        ...testConfig,
        ceremonyNumber: (): number | undefined => undefined,
      },
    });

    const ceremonies = await database.select().from(awardCeremonies);
    expect(ceremonies).toHaveLength(2);
    expect(ceremonies.every(row => row.ceremonyNumber === null)).toBe(true);
  });

  it('TMDbキーなしでも映画・翻訳・ノミネーションを作成する', async () => {
    await importImdbEventAward({
      environment,
      data: basicData(),
      config: testConfig,
    });

    const movieRows = await database.select().from(movies);
    expect(movieRows).toHaveLength(4);

    const [rashomon] = await database
      .select()
      .from(movies)
      .where(eq(movies.imdbId, 'tt0042876'));
    expect(rashomon.year).toBe(1951);

    const titleRows = await database
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, rashomon.uid),
          eq(translations.resourceType, 'movie_title'),
        ),
      );
    expect(titleRows).toHaveLength(1);
    expect(titleRows[0].languageCode).toBe('en');
    expect(titleRows[0].content).toBe('Rashômon');

    const nominationRows = await database
      .select()
      .from(nominations)
      .where(eq(nominations.movieUid, rashomon.uid));
    expect(nominationRows).toHaveLength(1);
    expect(nominationRows[0].isWinner).toBe(1);
  });

  it('再実行しても重複を作らない', async () => {
    await importImdbEventAward({
      environment,
      data: basicData(),
      config: testConfig,
    });
    await importImdbEventAward({
      environment,
      data: basicData(),
      config: testConfig,
    });

    expect(await database.select().from(movies)).toHaveLength(4);
    expect(await database.select().from(nominations)).toHaveLength(4);
    expect(await database.select().from(translations)).toHaveLength(4);
    expect(await database.select().from(awardCeremonies)).toHaveLength(2);
  });

  it('soft-deletedの映画はスキップし復活させない', async () => {
    await database.insert(movies).values({
      uid: 'deleted-rashomon',
      imdbId: 'tt0042876',
      year: 1950,
      deletedAt: 1000,
    });

    const stats = await importImdbEventAward({
      environment,
      data: basicData(),
      config: testConfig,
    });

    expect(stats.skippedSoftDeleted).toBe(1);
    const [row] = await database
      .select()
      .from(movies)
      .where(eq(movies.imdbId, 'tt0042876'));
    expect(row.deletedAt).toBe(1000);
    const nominationRows = await database
      .select()
      .from(nominations)
      .where(eq(nominations.movieUid, 'deleted-rashomon'));
    expect(nominationRows).toHaveLength(0);
  });

  it('既存の映画には新規作成せずノミネーションを付ける', async () => {
    await database.insert(movies).values({
      uid: 'existing-rashomon',
      imdbId: 'tt0042876',
      year: 1950,
    });

    const stats = await importImdbEventAward({
      environment,
      data: basicData(),
      config: testConfig,
    });

    expect(stats.moviesCreated).toBe(3);
    expect(stats.moviesExisting).toBe(1);
    const nominationRows = await database
      .select()
      .from(nominations)
      .where(eq(nominations.movieUid, 'existing-rashomon'));
    expect(nominationRows).toHaveLength(1);
    expect(nominationRows[0].isWinner).toBe(1);
  });

  it('既存ノミネーションのisWinnerを0から1へ更新する', async () => {
    await importImdbEventAward({
      environment,
      config: testConfig,
      data: collectedData([
        edition(2026, [
          nomination('tt37967547', 'Ink'),
          nomination('tt31434639', 'La Grazia'),
        ]),
      ]),
    });

    const stats = await importImdbEventAward({
      environment,
      config: testConfig,
      data: collectedData([
        edition(2026, [
          nomination('tt37967547', 'Ink', true),
          nomination('tt31434639', 'La Grazia'),
        ]),
      ]),
    });

    expect(stats.winnersUpdated).toBe(1);
    const [ink] = await database
      .select()
      .from(movies)
      .where(eq(movies.imdbId, 'tt37967547'));
    const nominationRows = await database
      .select()
      .from(nominations)
      .where(eq(nominations.movieUid, ink.uid));
    expect(nominationRows[0].isWinner).toBe(1);
  });

  it('year指定でその回だけ処理する', async () => {
    await importImdbEventAward({
      environment,
      data: basicData(),
      config: testConfig,
      year: 2026,
    });

    expect(await database.select().from(awardCeremonies)).toHaveLength(1);
    expect(await database.select().from(movies)).toHaveLength(2);
  });

  it('dryRunでは書き込まない', async () => {
    await importImdbEventAward({
      environment,
      data: basicData(),
      config: testConfig,
      dryRun: true,
    });

    expect(await database.select().from(awardOrganizations)).toHaveLength(0);
    expect(await database.select().from(movies)).toHaveLength(0);
  });

  it('TMDbが使える場合は詳細・邦題・ポスターを保存する', async () => {
    environment.TMDB_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/find/tt0042876')) {
          return Response.json({
            movie_results: [{id: 548, media_type: 'movie'}],
            tv_results: [],
          });
        }

        if (url.includes('/movie/548') && url.includes('language=ja')) {
          return Response.json({
            id: 548,
            title: '羅生門',
            original_title: '羅生門',
            overview: 'あらすじ',
          });
        }

        if (url.includes('/movie/548')) {
          return Response.json({
            id: 548,
            title: 'Rashomon',
            original_title: '羅生門',
            original_language: 'ja',
            release_date: '1950-08-25',
            poster_path: '/rashomon.jpg',
            imdb_id: 'tt0042876',
            overview: 'A samurai is murdered.',
          });
        }

        if (url.includes('/config')) {
          return Response.json({
            images: {
              secure_base_url: 'https://image.tmdb.org/t/p/',
              poster_sizes: ['w342', 'w500', 'original'],
            },
          });
        }

        return new Response('not found', {status: 404});
      }),
    );

    await importImdbEventAward({
      environment,
      config: testConfig,
      data: collectedData([
        edition(1951, [
          nomination('tt0042876', 'Rashômon', true),
          nomination('tt0000001', 'Unknown'),
        ]),
      ]),
      throttleMs: 0,
    });

    const [rashomon] = await database
      .select()
      .from(movies)
      .where(eq(movies.imdbId, 'tt0042876'));
    expect(rashomon.tmdbId).toBe(548);
    expect(rashomon.year).toBe(1950);
    expect(rashomon.originalLanguage).toBe('ja');

    const titleRows = await database
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, rashomon.uid),
          eq(translations.resourceType, 'movie_title'),
        ),
      );
    const byLanguage = new Map(titleRows.map(row => [row.languageCode, row]));
    expect(byLanguage.get('en')?.content).toBe('Rashomon');
    expect(byLanguage.get('ja')?.content).toBe('羅生門');

    const posterRows = await database
      .select()
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, rashomon.uid));
    expect(posterRows[0].url).toBe(
      'https://image.tmdb.org/t/p/w500/rashomon.jpg',
    );

    const referenceRows = await database
      .select()
      .from(referenceUrls)
      .where(eq(referenceUrls.movieUid, rashomon.uid));
    expect(
      referenceRows
        .map(row => row.sourceType)
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(['imdb', 'other']);

    const [unknown] = await database
      .select()
      .from(movies)
      .where(eq(movies.imdbId, 'tt0000001'));
    expect(unknown.tmdbId).toBeNull();
    expect(unknown.year).toBe(1951);
  });

  it('TMDbのIDが既存映画と衝突したら既存映画を再利用しimdbIdを補完する', async () => {
    environment.TMDB_API_KEY = 'test-key';
    await database.insert(movies).values({
      uid: 'existing-by-tmdb',
      tmdbId: 548,
      year: 1950,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/find/tt0042876')) {
          return Response.json({
            movie_results: [{id: 548, media_type: 'movie'}],
            tv_results: [],
          });
        }

        if (url.includes('/movie/548')) {
          return Response.json({
            id: 548,
            title: 'Rashomon',
            original_title: '羅生門',
            release_date: '1950-08-25',
          });
        }

        if (url.includes('/config')) {
          return Response.json({
            images: {secure_base_url: 'https://x/', poster_sizes: ['w500']},
          });
        }

        return new Response('not found', {status: 404});
      }),
    );

    await importImdbEventAward({
      environment,
      config: testConfig,
      data: collectedData([
        edition(1951, [
          nomination('tt0042876', 'Rashômon', true),
          nomination('tt0043338', 'Ace in the Hole'),
        ]),
      ]),
      throttleMs: 0,
    });

    const movieRows = await database.select().from(movies);
    expect(movieRows).toHaveLength(2);
    const [reused] = await database
      .select()
      .from(movies)
      .where(eq(movies.uid, 'existing-by-tmdb'));
    expect(reused.imdbId).toBe('tt0042876');
    const nominationRows = await database
      .select()
      .from(nominations)
      .where(eq(nominations.movieUid, 'existing-by-tmdb'));
    expect(nominationRows).toHaveLength(1);
  });
});
