import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {and, eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  buildSparqlQuery,
  cleanWikidataLabel,
  importJapaneseTitlesFromWikidata,
  parseSparqlResponse,
} from '../wikidata-japanese-titles';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: ReturnType<typeof getDatabase>;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-wikidata-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return {environment, database};
}

async function seedMovie(
  database: ReturnType<typeof getDatabase>,
  values: {uid: string; imdbId?: string; enTitle: string; jaTitle?: string},
): Promise<void> {
  await database
    .insert(movies)
    .values({uid: values.uid, imdbId: values.imdbId, year: 1950});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: values.uid,
    languageCode: 'en',
    content: values.enTitle,
    isDefault: 1,
  });
  if (values.jaTitle) {
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: values.uid,
      languageCode: 'ja',
      content: values.jaTitle,
    });
  }
}

function sparqlResponse(pairs: Array<[string, string]>) {
  return {
    results: {
      bindings: pairs.map(([imdb, label]) => ({
        imdb: {value: imdb},
        jaLabel: {value: label},
      })),
    },
  };
}

describe('buildSparqlQuery', () => {
  it('渡したIMDb IDをすべて含む', () => {
    const query = buildSparqlQuery(['tt0042876', 'tt0043338']);
    expect(query).toContain('"tt0042876"');
    expect(query).toContain('"tt0043338"');
  });

  it('IMDb IDのプロパティで引く', () => {
    expect(buildSparqlQuery(['tt0042876'])).toContain('wdt:P345');
  });

  it('日本語ラベルに絞る', () => {
    expect(buildSparqlQuery(['tt0042876'])).toContain('"ja"');
  });

  it('IMDb ID形式でないものは問い合わせに含めない', () => {
    const query = buildSparqlQuery(['tt0042876', 'not-an-id', '"; DROP']);
    expect(query).toContain('"tt0042876"');
    expect(query).not.toContain('not-an-id');
    expect(query).not.toContain('DROP');
  });
});

describe('cleanWikidataLabel', () => {
  it('曖昧さ回避の「(映画)」を落とす', () => {
    expect(cleanWikidataLabel('ミュージック・マン (映画)')).toBe(
      'ミュージック・マン',
    );
  });

  it('年つきの曖昧さ回避も落とす', () => {
    expect(cleanWikidataLabel('タキシード (1986年の映画)')).toBe('タキシード');
  });

  it('全角括弧にも対応する', () => {
    expect(cleanWikidataLabel('オテロ（1986年の映画）')).toBe('オテロ');
  });

  it('映画と無関係な括弧は残す', () => {
    expect(cleanWikidataLabel('ヱヴァンゲリヲン新劇場版:序 (前編)')).toBe(
      'ヱヴァンゲリヲン新劇場版:序 (前編)',
    );
  });

  it('タイトル途中の括弧は残す', () => {
    expect(cleanWikidataLabel('恋する惑星 (映画) の続編')).toBe(
      '恋する惑星 (映画) の続編',
    );
  });
});

describe('parseSparqlResponse', () => {
  it('IMDb IDと日本語ラベルの対応を返す', () => {
    const result = parseSparqlResponse(
      sparqlResponse([['tt0042876', '羅生門']]),
    );
    expect(result.get('tt0042876')).toBe('羅生門');
  });

  it('日本語文字を含まないラベルは捨てる', () => {
    const result = parseSparqlResponse(
      sparqlResponse([['tt0042876', 'Rashomon']]),
    );
    expect(result.has('tt0042876')).toBe(false);
  });

  it('曖昧さ回避の接尾辞を落として保存する', () => {
    const result = parseSparqlResponse(
      sparqlResponse([['tt0056262', 'ミュージック・マン (映画)']]),
    );
    expect(result.get('tt0056262')).toBe('ミュージック・マン');
  });

  it('接尾辞を落とすと日本語が残らないラベルは捨てる', () => {
    const result = parseSparqlResponse(
      sparqlResponse([['tt0000001', 'Summer of 85 (映画)']]),
    );
    expect(result.has('tt0000001')).toBe(false);
  });

  it('前後の空白を落とす', () => {
    const result = parseSparqlResponse(
      sparqlResponse([['tt0042876', '  羅生門  ']]),
    );
    expect(result.get('tt0042876')).toBe('羅生門');
  });

  it('空の結果でも壊れない', () => {
    expect(parseSparqlResponse(sparqlResponse([])).size).toBe(0);
    expect(parseSparqlResponse({}).size).toBe(0);
  });
});

const stubWikidata = (pairs: Array<[string, string]>) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(sparqlResponse(pairs))),
  );
};

async function japaneseTitleOf(
  database: ReturnType<typeof getDatabase>,
  uid: string,
): Promise<string | undefined> {
  const [row] = await database
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.resourceUid, uid),
        eq(translations.resourceType, 'movie_title'),
        eq(translations.languageCode, 'ja'),
      ),
    );
  return row?.content;
}

describe('importJapaneseTitlesFromWikidata', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('邦題が無い映画に保存する', async () => {
    await seedMovie(database, {
      uid: 'm1',
      imdbId: 'tt0042876',
      enTitle: 'Rashomon',
    });
    stubWikidata([['tt0042876', '羅生門']]);

    const stats = await importJapaneseTitlesFromWikidata({
      environment,
      throttleMs: 0,
    });

    expect(stats.saved).toBe(1);
    expect(await japaneseTitleOf(database, 'm1')).toBe('羅生門');
  });

  it('ローマ字のまま保存されている邦題を置き換える', async () => {
    await seedMovie(database, {
      uid: 'm1',
      imdbId: 'tt0042876',
      enTitle: 'Rashomon',
      jaTitle: 'Rashômon',
    });
    stubWikidata([['tt0042876', '羅生門']]);

    const stats = await importJapaneseTitlesFromWikidata({
      environment,
      throttleMs: 0,
    });

    expect(stats.replaced).toBe(1);
    expect(await japaneseTitleOf(database, 'm1')).toBe('羅生門');
  });

  it('既に日本語の邦題がある映画は対象にしない', async () => {
    await seedMovie(database, {
      uid: 'm1',
      imdbId: 'tt0042876',
      enTitle: 'Rashomon',
      jaTitle: '羅生門',
    });
    stubWikidata([['tt0042876', '別のタイトル']]);

    const stats = await importJapaneseTitlesFromWikidata({
      environment,
      throttleMs: 0,
    });

    expect(stats.candidates).toBe(0);
    expect(await japaneseTitleOf(database, 'm1')).toBe('羅生門');
  });

  it('IMDb IDが無い映画は対象にしない', async () => {
    await seedMovie(database, {uid: 'm1', enTitle: 'No Id'});
    stubWikidata([]);

    const stats = await importJapaneseTitlesFromWikidata({
      environment,
      throttleMs: 0,
    });

    expect(stats.candidates).toBe(0);
  });

  it('soft-deletedの映画は対象にしない', async () => {
    await seedMovie(database, {
      uid: 'm1',
      imdbId: 'tt0042876',
      enTitle: 'Rashomon',
    });
    await database
      .update(movies)
      .set({deletedAt: 1000})
      .where(eq(movies.uid, 'm1'));
    stubWikidata([['tt0042876', '羅生門']]);

    const stats = await importJapaneseTitlesFromWikidata({
      environment,
      throttleMs: 0,
    });

    expect(stats.candidates).toBe(0);
  });

  it('Wikidataに無い映画は何も書かない', async () => {
    await seedMovie(database, {
      uid: 'm1',
      imdbId: 'tt0042876',
      enTitle: 'Obscure',
    });
    stubWikidata([]);

    const stats = await importJapaneseTitlesFromWikidata({
      environment,
      throttleMs: 0,
    });

    expect(stats.saved).toBe(0);
    expect(stats.notFound).toBe(1);
    expect(await japaneseTitleOf(database, 'm1')).toBeUndefined();
  });

  it('バッチに分けて問い合わせる', async () => {
    for (let index = 0; index < 5; index++) {
      await seedMovie(database, {
        uid: `m${index}`,
        imdbId: `tt000000${index}`,
        enTitle: `Film ${index}`,
      });
    }

    const fetchMock = vi.fn(async () => Response.json(sparqlResponse([])));
    vi.stubGlobal('fetch', fetchMock);

    await importJapaneseTitlesFromWikidata({
      environment,
      throttleMs: 0,
      batchSize: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('dryRunでは書き込まない', async () => {
    await seedMovie(database, {
      uid: 'm1',
      imdbId: 'tt0042876',
      enTitle: 'Rashomon',
    });
    stubWikidata([['tt0042876', '羅生門']]);

    const stats = await importJapaneseTitlesFromWikidata({
      environment,
      throttleMs: 0,
      dryRun: true,
    });

    expect(stats.saved).toBe(1);
    expect(await japaneseTitleOf(database, 'm1')).toBeUndefined();
  });

  it('limitで件数を絞る', async () => {
    await seedMovie(database, {uid: 'm1', imdbId: 'tt0000001', enTitle: 'A'});
    await seedMovie(database, {uid: 'm2', imdbId: 'tt0000002', enTitle: 'B'});
    stubWikidata([]);

    const stats = await importJapaneseTitlesFromWikidata({
      environment,
      throttleMs: 0,
      limit: 1,
    });

    expect(stats.candidates).toBe(1);
  });
});
