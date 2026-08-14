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
  extractGoldenLionEditions,
  importVeniceGoldenLion,
  veniceCeremonyNumber,
  type VeniceCollectedData,
  type VeniceEdition,
} from '../venice-film-festival';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: ReturnType<typeof getDatabase>;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-venice-'));
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
): VeniceEdition['goldenLion'][number]['categories'][number]['nominations'][number] {
  return {
    isWinner,
    notes: null,
    titles: [{imdbId, title: originalTitle, originalTitle}],
  };
}

function edition(
  year: number,
  nominations_: Array<
    VeniceEdition['goldenLion'][number]['categories'][number]['nominations'][number]
  >,
  category: string | null = null,
): VeniceEdition {
  return {
    year,
    awardNames: ['Golden Lion'],
    goldenLion: [
      {
        categories: [{category, total: null, nominations: nominations_}],
      },
    ],
  };
}

function collectedData(editions: VeniceEdition[]): VeniceCollectedData {
  return {
    collectedAt: '2026-08-14',
    source: 'https://www.imdb.com/event/ev0000681/',
    editions,
  };
}

describe('veniceCeremonyNumber', () => {
  it('第1回は1932年', () => {
    expect(veniceCeremonyNumber(1932)).toBe(1);
  });

  it('1934〜1939年は年-1932', () => {
    expect(veniceCeremonyNumber(1934)).toBe(2);
    expect(veniceCeremonyNumber(1939)).toBe(7);
  });

  it('戦時中の1940〜1942年は公式回次に数えない', () => {
    expect(veniceCeremonyNumber(1940)).toBeUndefined();
    expect(veniceCeremonyNumber(1942)).toBeUndefined();
  });

  it('1946年は公式回次に数えない', () => {
    expect(veniceCeremonyNumber(1946)).toBeUndefined();
  });

  it('1947〜1972年は年-1939', () => {
    expect(veniceCeremonyNumber(1947)).toBe(8);
    expect(veniceCeremonyNumber(1949)).toBe(10);
    expect(veniceCeremonyNumber(1968)).toBe(29);
    expect(veniceCeremonyNumber(1972)).toBe(33);
  });

  it('未開催・非公式の1973〜1978年はundefined', () => {
    expect(veniceCeremonyNumber(1973)).toBeUndefined();
    expect(veniceCeremonyNumber(1975)).toBeUndefined();
    expect(veniceCeremonyNumber(1978)).toBeUndefined();
  });

  it('1979年は第36回', () => {
    expect(veniceCeremonyNumber(1979)).toBe(36);
  });

  it('1980年以降は年-1943', () => {
    expect(veniceCeremonyNumber(1980)).toBe(37);
    expect(veniceCeremonyNumber(2025)).toBe(82);
    expect(veniceCeremonyNumber(2026)).toBe(83);
  });
});

describe('extractGoldenLionEditions', () => {
  it('goldenLionが空の回は除外する', () => {
    const data = collectedData([
      {year: 1946, awardNames: ['ANICA Cup'], goldenLion: []},
      edition(1951, [
        nomination('tt0042876', 'Rashômon', true),
        nomination('tt0043338', 'Ace in the Hole'),
      ]),
    ]);

    const editions = extractGoldenLionEditions(data);

    expect(editions.map(entry => entry.year)).toEqual([1951]);
  });

  it('Best Film以外のカテゴリ（Immersive VR等）を除外する', () => {
    const data = collectedData([
      {
        year: 2018,
        awardNames: ['Golden Lion'],
        goldenLion: [
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

    const editions = extractGoldenLionEditions(data);

    expect(editions[0].films.map(film => film.imdbId)).toEqual([
      'tt6155172',
      'tt5342766',
    ]);
  });

  it('nullカテゴリとBest Filmカテゴリを統合する', () => {
    const data = collectedData([
      {
        year: 1957,
        awardNames: ['Golden Lion'],
        goldenLion: [
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

    const editions = extractGoldenLionEditions(data);

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

    const editions = extractGoldenLionEditions(data);

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

    const editions = extractGoldenLionEditions(data);

    expect(editions[0].films).toHaveLength(2);
    const winner = editions[0].films.find(film => film.imdbId === 'tt0053946');
    expect(winner?.isWinner).toBe(true);
  });

  it('2件未満しか残らない回（1979年のノイズ等）を除外する', () => {
    const data = collectedData([
      edition(1979, [nomination('tt0078978', 'Clair de femme')]),
      edition(1980, [
        nomination('tt0080749', 'Gloria', true),
        nomination('tt0080388', 'Atlantic City', true),
      ]),
    ]);

    const editions = extractGoldenLionEditions(data);

    expect(editions.map(entry => entry.year)).toEqual([1980]);
  });
});

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

describe('importVeniceGoldenLion', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('組織・カテゴリ・回次付きセレモニーを作成する', async () => {
    await importVeniceGoldenLion({environment, data: basicData()});

    const [organization] = await database
      .select()
      .from(awardOrganizations)
      .where(eq(awardOrganizations.name, 'Venice Film Festival'));
    expect(organization.country).toBe('Italy');
    expect(organization.establishedYear).toBe(1932);

    const [category] = await database
      .select()
      .from(awardCategories)
      .where(eq(awardCategories.organizationUid, organization.uid));
    expect(category.name).toBe('Golden Lion');

    const ceremonies = await database
      .select()
      .from(awardCeremonies)
      .where(eq(awardCeremonies.organizationUid, organization.uid));
    const byYear = new Map(ceremonies.map(row => [row.year, row]));
    expect(byYear.get(1951)?.ceremonyNumber).toBe(12);
    expect(byYear.get(2026)?.ceremonyNumber).toBe(83);
  });

  it('TMDbキーなしでも映画・翻訳・ノミネーションを作成する', async () => {
    await importVeniceGoldenLion({environment, data: basicData()});

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
    await importVeniceGoldenLion({environment, data: basicData()});
    await importVeniceGoldenLion({environment, data: basicData()});

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

    const stats = await importVeniceGoldenLion({
      environment,
      data: basicData(),
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

    const stats = await importVeniceGoldenLion({
      environment,
      data: basicData(),
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
    await importVeniceGoldenLion({
      environment,
      data: collectedData([
        edition(2026, [
          nomination('tt37967547', 'Ink'),
          nomination('tt31434639', 'La Grazia'),
        ]),
      ]),
    });

    const stats = await importVeniceGoldenLion({
      environment,
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
    await importVeniceGoldenLion({
      environment,
      data: basicData(),
      year: 2026,
    });

    expect(await database.select().from(awardCeremonies)).toHaveLength(1);
    expect(await database.select().from(movies)).toHaveLength(2);
  });

  it('dryRunでは書き込まない', async () => {
    await importVeniceGoldenLion({
      environment,
      data: basicData(),
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

        if (url.includes('/configuration')) {
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

    await importVeniceGoldenLion({
      environment,
      data: collectedData([
        edition(1951, [
          nomination('tt0042876', 'Rashômon', true),
          {
            isWinner: false,
            notes: null,
            titles: [
              {imdbId: 'tt0000001', title: 'Unknown', originalTitle: 'Unknown'},
            ],
          },
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
    expect(referenceRows.map(row => row.sourceType).toSorted()).toEqual([
      'imdb',
      'other',
    ]);

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

        if (url.includes('/configuration')) {
          return Response.json({
            images: {secure_base_url: 'https://x/', poster_sizes: ['w500']},
          });
        }

        return new Response('not found', {status: 404});
      }),
    );

    await importVeniceGoldenLion({
      environment,
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
