import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {and, eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  buildSparqlQuery,
  cleanPersonLabel,
  importJapaneseNamesFromWikidata,
  parseSparqlResponse,
} from '../wikidata-japanese-names';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: ReturnType<typeof getDatabase>;
}> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-wikidata-names-'),
  );
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return {environment, database};
}

async function seedPerson(
  database: ReturnType<typeof getDatabase>,
  values: {uid: string; tmdbId: number; name: string; jaName?: string},
): Promise<void> {
  await database.insert(people).values({
    uid: values.uid,
    tmdbId: values.tmdbId,
    name: values.name,
  });
  if (values.jaName) {
    await database.insert(translations).values({
      resourceType: 'person_name',
      resourceUid: values.uid,
      languageCode: 'ja',
      content: values.jaName,
    });
  }
}

async function seedCredits(
  database: ReturnType<typeof getDatabase>,
  personUid: string,
  count: number,
): Promise<void> {
  for (let index = 0; index < count; index++) {
    const movieUid = `${personUid}-movie-${index}`;
    await database.insert(movies).values({uid: movieUid, year: 1950});
    await database.insert(movieCredits).values({
      movieUid,
      personUid,
      creditId: `${personUid}-credit-${index}`,
      department: 'Acting',
    });
  }
}

async function seedNomination(
  database: ReturnType<typeof getDatabase>,
  personUid: string,
): Promise<void> {
  const [organization] = await database
    .insert(awardOrganizations)
    .values({name: `org-${personUid}`})
    .returning();
  const [ceremony] = await database
    .insert(awardCeremonies)
    .values({organizationUid: organization.uid, year: 1950})
    .returning();
  const [category] = await database
    .insert(awardCategories)
    .values({organizationUid: organization.uid, name: 'Best Actor'})
    .returning();
  const movieUid = `${personUid}-nominated`;
  await database.insert(movies).values({uid: movieUid, year: 1950});
  await database.insert(nominations).values({
    movieUid,
    ceremonyUid: ceremony.uid,
    categoryUid: category.uid,
    personUid,
    isWinner: 1,
  });
}

function sparqlResponse(pairs: Array<[string, string]>) {
  return {
    results: {
      bindings: pairs.map(([tmdb, label]) => ({
        tmdb: {value: tmdb},
        jaLabel: {value: label},
      })),
    },
  };
}

const stubWikidata = (pairs: Array<[string, string]>) => {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
    Response.json(sparqlResponse(pairs)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

async function japaneseNameOf(
  database: ReturnType<typeof getDatabase>,
  uid: string,
): Promise<string | undefined> {
  const [row] = await database
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.resourceUid, uid),
        eq(translations.resourceType, 'person_name'),
        eq(translations.languageCode, 'ja'),
      ),
    );
  return row?.content;
}

describe('buildSparqlQuery', () => {
  it('渡したTMDb IDをすべて含む', () => {
    const query = buildSparqlQuery([94_167, 20_556]);
    expect(query).toContain('"94167"');
    expect(query).toContain('"20556"');
  });

  it('TMDb person IDのプロパティで引く', () => {
    expect(buildSparqlQuery([94_167])).toContain('wdt:P4985');
  });

  it('日本語ラベルに絞る', () => {
    expect(buildSparqlQuery([94_167])).toContain('"ja"');
  });

  it('ja.wikipediaのsitelinkも問い合わせる', () => {
    const query = buildSparqlQuery([94_167]);
    expect(query).toContain('schema:about');
    expect(query).toContain('ja.wikipedia.org');
  });
});

describe('cleanPersonLabel', () => {
  it('職業の曖昧さ回避を落とす', () => {
    expect(cleanPersonLabel('ジョン・フォード (映画監督)')).toBe(
      'ジョン・フォード',
    );
  });

  it('全角括弧にも対応する', () => {
    expect(cleanPersonLabel('ジョン・フォード（俳優）')).toBe(
      'ジョン・フォード',
    );
  });

  it('生年つきの曖昧さ回避も落とす', () => {
    expect(cleanPersonLabel('ジェームズ・スチュワート (1908年生の俳優)')).toBe(
      'ジェームズ・スチュワート',
    );
  });

  it('括弧が無ければそのまま返す', () => {
    expect(cleanPersonLabel('ピエトロ・ジェルミ')).toBe('ピエトロ・ジェルミ');
  });

  it('前後の空白を落とす', () => {
    expect(cleanPersonLabel('  ピエトロ・ジェルミ ')).toBe(
      'ピエトロ・ジェルミ',
    );
  });
});

describe('parseSparqlResponse', () => {
  it('TMDb IDと日本語ラベルの対応を返す', () => {
    const names = parseSparqlResponse(
      sparqlResponse([
        ['94167', 'ジョーン・ローリング'],
        ['20556', 'ベルトラン・タヴェルニエ'],
      ]),
    );
    expect(names.get(94_167)).toBe('ジョーン・ローリング');
    expect(names.get(20_556)).toBe('ベルトラン・タヴェルニエ');
  });

  it('日本語文字を含まないラベルは捨てる', () => {
    const names = parseSparqlResponse(
      sparqlResponse([['94167', 'Joan Lorring']]),
    );
    expect(names.has(94_167)).toBe(false);
  });

  it('曖昧さ回避の接尾辞を落として保存する', () => {
    const names = parseSparqlResponse(
      sparqlResponse([['94167', 'ジョン・フォード (映画監督)']]),
    );
    expect(names.get(94_167)).toBe('ジョン・フォード');
  });

  it('数値でないTMDb IDは捨てる', () => {
    const names = parseSparqlResponse(sparqlResponse([['abc', 'ジョン']]));
    expect(names.size).toBe(0);
  });

  it('空の結果でも壊れない', () => {
    expect(parseSparqlResponse({}).size).toBe(0);
  });

  it('ja.wikipediaの記事名をラベルより優先する', () => {
    const names = parseSparqlResponse({
      results: {
        bindings: [
          {
            tmdb: {value: '94167'},
            jaLabel: {value: 'ラベルの名前'},
            article: {
              value: `https://ja.wikipedia.org/wiki/${encodeURIComponent('記事の名前_(俳優)')}`,
            },
          },
        ],
      },
    });
    expect(names.get(94_167)).toBe('記事の名前');
  });

  it('記事名から日本語が残らなければラベルへフォールバックする', () => {
    const names = parseSparqlResponse({
      results: {
        bindings: [
          {
            tmdb: {value: '94167'},
            jaLabel: {value: 'ジョーン・ローリング'},
            article: {
              value: 'https://ja.wikipedia.org/wiki/Joan_Lorring',
            },
          },
        ],
      },
    });
    expect(names.get(94_167)).toBe('ジョーン・ローリング');
  });

  it('同じTMDb IDに複数の項目があっても先に来たものを使う', () => {
    const names = parseSparqlResponse(
      sparqlResponse([
        ['94167', '先の名前'],
        ['94167', '後の名前'],
      ]),
    );
    expect(names.get(94_167)).toBe('先の名前');
  });
});

describe('importJapaneseNamesFromWikidata', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('日本語名が無い人物に保存する', async () => {
    await seedPerson(database, {
      uid: 'p1',
      tmdbId: 94_167,
      name: 'Joan Lorring',
    });
    stubWikidata([['94167', 'ジョーン・ローリング']]);

    const stats = await importJapaneseNamesFromWikidata({
      environment,
      throttleMs: 0,
    });

    expect(stats.candidates).toBe(1);
    expect(stats.saved).toBe(1);
    expect(await japaneseNameOf(database, 'p1')).toBe('ジョーン・ローリング');
  });

  it('既に日本語名がある人物は対象にしない', async () => {
    await seedPerson(database, {
      uid: 'p1',
      tmdbId: 94_167,
      name: 'Joan Lorring',
      jaName: 'ジョーン・ローリング',
    });
    stubWikidata([['94167', '別の名前']]);

    const stats = await importJapaneseNamesFromWikidata({
      environment,
      throttleMs: 0,
    });

    expect(stats.candidates).toBe(0);
    expect(await japaneseNameOf(database, 'p1')).toBe('ジョーン・ローリング');
  });

  it('名前そのものが日本語の人物は対象にしない', async () => {
    await seedPerson(database, {uid: 'p1', tmdbId: 1, name: '黒澤明'});
    stubWikidata([['1', '黒澤 明']]);

    const stats = await importJapaneseNamesFromWikidata({
      environment,
      throttleMs: 0,
    });

    expect(stats.candidates).toBe(0);
    expect(await japaneseNameOf(database, 'p1')).toBeUndefined();
  });

  it('ローマ字のまま保存されている日本語名を置き換える', async () => {
    await seedPerson(database, {
      uid: 'p1',
      tmdbId: 94_167,
      name: 'Joan Lorring',
      jaName: 'Joan Lorring',
    });
    stubWikidata([['94167', 'ジョーン・ローリング']]);

    const stats = await importJapaneseNamesFromWikidata({
      environment,
      throttleMs: 0,
    });

    expect(stats.replaced).toBe(1);
    expect(await japaneseNameOf(database, 'p1')).toBe('ジョーン・ローリング');
  });

  it('Wikidataに無い人物は未発見として数える', async () => {
    await seedPerson(database, {
      uid: 'p1',
      tmdbId: 94_167,
      name: 'Joan Lorring',
    });
    stubWikidata([]);

    const stats = await importJapaneseNamesFromWikidata({
      environment,
      throttleMs: 0,
    });

    expect(stats.notFound).toBe(1);
    expect(await japaneseNameOf(database, 'p1')).toBeUndefined();
  });

  it('dry-runでは書き込まない', async () => {
    await seedPerson(database, {
      uid: 'p1',
      tmdbId: 94_167,
      name: 'Joan Lorring',
    });
    stubWikidata([['94167', 'ジョーン・ローリング']]);

    const stats = await importJapaneseNamesFromWikidata({
      environment,
      dryRun: true,
      throttleMs: 0,
    });

    expect(stats.saved).toBe(1);
    expect(await japaneseNameOf(database, 'p1')).toBeUndefined();
  });

  it('個人賞を持つ人物、クレジットの多い人物の順に処理する', async () => {
    await seedPerson(database, {uid: 'p1', tmdbId: 1, name: 'One Credit'});
    await seedCredits(database, 'p1', 1);
    await seedPerson(database, {uid: 'p2', tmdbId: 2, name: 'Awarded'});
    await seedNomination(database, 'p2');
    await seedPerson(database, {uid: 'p3', tmdbId: 3, name: 'Three Credits'});
    await seedCredits(database, 'p3', 3);
    const fetchMock = stubWikidata([]);

    await importJapaneseNamesFromWikidata({
      environment,
      batchSize: 1,
      throttleMs: 0,
    });

    const queried = fetchMock.mock.calls.map(([url]) => {
      const query = new URL(String(url)).searchParams.get('query') ?? '';
      return /"(\d+)"/.exec(query)?.[1];
    });
    expect(queried).toEqual(['2', '3', '1']);
  });

  it('limitで処理件数を絞る', async () => {
    await seedPerson(database, {uid: 'p1', tmdbId: 1, name: 'First'});
    await seedPerson(database, {uid: 'p2', tmdbId: 2, name: 'Second'});
    stubWikidata([]);

    const stats = await importJapaneseNamesFromWikidata({
      environment,
      limit: 1,
      throttleMs: 0,
    });

    expect(stats.candidates).toBe(1);
  });
});
