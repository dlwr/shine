import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {and, eq} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {getScrapeDatabase} from '../common/dry-run';
import {
  decideJapaneseTitleFix,
  fixJapaneseTitleContamination,
  isContaminationCandidate,
  type TmdbTitleDetails,
} from '../fix-japanese-title-contamination';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

describe('isContaminationCandidate', () => {
  it('日本語文字を含まない行は候補', () => {
    expect(isContaminationCandidate('کمی نور', 'fa')).toBe(true);
    expect(isContaminationCandidate('HERO', 'zh')).toBe(true);
    expect(isContaminationCandidate('Rashômon', 'ja')).toBe(true);
  });

  it('原語が日本語でない漢字だけの行も候補', () => {
    expect(isContaminationCandidate('一步之遥', 'zh')).toBe(true);
  });

  it('かなを含む行と日本語映画の漢字の行は候補にしない', () => {
    expect(isContaminationCandidate('ドライブ・マイ・カー', 'ja')).toBe(false);
    expect(isContaminationCandidate('羅生門', 'ja')).toBe(false);
    expect(isContaminationCandidate('さらば、わが愛／覇王別姫', 'zh')).toBe(
      false,
    );
  });
});

const details = (overrides: Partial<TmdbTitleDetails>): TmdbTitleDetails => ({
  title: undefined,
  original_title: undefined,
  original_language: 'en',
  ...overrides,
});

describe('decideJapaneseTitleFix', () => {
  it('原題フォールバックと一致する行は原語の行へ移す', () => {
    expect(
      decideJapaneseTitleFix(
        'کمی نور',
        details({
          title: 'کمی نور',
          original_title: 'کمی نور',
          original_language: 'fa',
        }),
      ),
    ).toEqual({action: 'relocate', languageCode: 'fa'});
  });

  it('前後の空白の違いは一致とみなす', () => {
    expect(
      decideJapaneseTitleFix(
        'Kvinde ukendt ',
        details({
          title: 'Kvinde ukendt',
          original_title: 'Kvinde ukendt',
          original_language: 'da',
        }),
      ),
    ).toEqual({action: 'relocate', languageCode: 'da'});
  });

  it('原語コードが2文字でなければ削除する', () => {
    expect(
      decideJapaneseTitleFix(
        'Stumm',
        details({
          title: 'Stumm',
          original_title: 'Stumm',
          original_language: 'xx',
        }),
      ),
    ).toEqual({action: 'relocate', languageCode: 'xx'});
    expect(
      decideJapaneseTitleFix(
        'Stumm',
        details({
          title: 'Stumm',
          original_title: 'Stumm',
          original_language: '',
        }),
      ),
    ).toEqual({action: 'delete'});
  });

  it('既に日本語の題名がある行はTMDbの訳で置き換えない', () => {
    expect(
      decideJapaneseTitleFix(
        '八十日間世界一周',
        details({
          title: '80日間世界一周',
          original_title: 'Around the World in Eighty Days',
          original_language: 'en',
        }),
      ),
    ).toEqual({action: 'keep'});
  });

  it('漢字だけの原題フォールバックはTMDbに日本語訳があれば置き換える', () => {
    expect(
      decideJapaneseTitleFix(
        '悲情城市',
        details({
          title: '非情城市',
          original_title: '悲情城市',
          original_language: 'zh',
        }),
      ),
    ).toEqual({action: 'replace', title: '非情城市'});
  });

  it('TMDbに日本語訳があれば置き換える', () => {
    expect(
      decideJapaneseTitleFix(
        'Rashômon',
        details({
          title: '羅生門',
          original_title: '羅生門',
          original_language: 'ja',
        }),
      ),
    ).toEqual({action: 'replace', title: '羅生門'});
    expect(
      decideJapaneseTitleFix(
        '一步之遥',
        details({
          title: 'ゴーン・ウィズ・ザ・ブレッツ',
          original_title: '一步之遥',
          original_language: 'zh',
        }),
      ),
    ).toEqual({action: 'replace', title: 'ゴーン・ウィズ・ザ・ブレッツ'});
  });

  it('大文字小文字だけ違うラテン文字の邦題は残す', () => {
    expect(
      decideJapaneseTitleFix(
        'SAFE',
        details({
          title: 'SAFE',
          original_title: 'Safe',
          original_language: 'en',
        }),
      ),
    ).toEqual({action: 'keep'});
  });

  it('原題と違うラテン文字の邦題は残す', () => {
    expect(
      decideJapaneseTitleFix(
        'E.T.',
        details({
          title: 'E.T.',
          original_title: 'E.T. the Extra-Terrestrial',
          original_language: 'en',
        }),
      ),
    ).toEqual({action: 'keep'});
  });

  it('漢字を含む行は原題と一致しても削除しない', () => {
    expect(
      decideJapaneseTitleFix(
        '悲情城市',
        details({
          title: '悲情城市',
          original_title: '悲情城市',
          original_language: 'zh',
        }),
      ),
    ).toEqual({action: 'keep', flag: 'kanjiEqualsOriginal'});
  });

  it('ラテン文字も日本語も含まない行は残しつつ手動確認の印を付ける', () => {
    expect(
      decideJapaneseTitleFix(
        'Бег',
        details({
          title: 'Бег.',
          original_title: 'Бег.',
          original_language: 'ru',
        }),
      ),
    ).toEqual({action: 'keep', flag: 'foreignScript'});
  });

  it('日本語映画のローマ字はTMDbにも日本語が無ければ残す', () => {
    expect(
      decideJapaneseTitleFix(
        'Rashômon',
        details({
          title: 'Rashômon',
          original_title: 'Rashômon',
          original_language: 'ja',
        }),
      ),
    ).toEqual({action: 'keep'});
  });

  it('TMDbの応答が無ければ判断しない', () => {
    expect(decideJapaneseTitleFix('کمی نور', undefined)).toEqual({
      action: 'unverified',
    });
  });
});

describe('fixJapaneseTitleContamination', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  const insertMovie = async (
    uid: string,
    originalLanguage: string,
    jaTitle: string,
    options: {tmdbId?: number; deleted?: boolean} = {},
  ) => {
    await database.insert(movies).values({
      uid,
      year: 2020,
      originalLanguage,
      tmdbId: options.tmdbId ?? Number(uid.replaceAll(/\D/g, '')),
      imdbId: `tt${uid}`,
      deletedAt: options.deleted ? 1 : undefined,
    });
    await database.insert(translations).values([
      {
        resourceType: 'movie_title',
        resourceUid: uid,
        languageCode: 'en',
        content: `${uid} english`,
        isDefault: 1,
      },
      {
        resourceType: 'movie_title',
        resourceUid: uid,
        languageCode: 'ja',
        content: jaTitle,
        isDefault: 0,
      },
    ]);
  };

  const titleOf = async (movieUid: string, languageCode: string) => {
    const rows = await database
      .select({content: translations.content})
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, movieUid),
          eq(translations.resourceType, 'movie_title'),
          eq(translations.languageCode, languageCode),
        ),
      );
    return rows[0]?.content;
  };

  const jaTitleOf = async (movieUid: string) => titleOf(movieUid, 'ja');

  const detailsByMovie: Record<string, TmdbTitleDetails | undefined> = {
    m1: {title: 'کمی نور', original_title: 'کمی نور', original_language: 'fa'},
    m2: {title: '羅生門', original_title: '羅生門', original_language: 'ja'},
    m3: {
      title: 'E.T.',
      original_title: 'E.T. the Extra-Terrestrial',
      original_language: 'en',
    },
    m4: undefined,
    m5: {title: 'Бег', original_title: 'Бег', original_language: 'ru'},
    m7: {
      title: 'La visita',
      original_title: 'La visita',
      original_language: 'it',
    },
  };

  const fetchDetails = async (movie: {uid: string}) =>
    detailsByMovie[movie.uid];

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ja-title-fix-'));
    environment = {
      TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: '',
      TMDB_API_KEY: 'test-key',
    };
    database = getDatabase(environment);
    await migrate(database, {migrationsFolder});

    await insertMovie('m1', 'fa', 'کمی نور');
    await insertMovie('m2', 'ja', 'Rashômon');
    await insertMovie('m3', 'en', 'E.T.');
    await insertMovie('m4', 'he', 'בית אבי');
    await insertMovie('m5', 'ru', 'Бег', {deleted: true});
    await insertMovie('m6', 'ja', 'ドライブ・マイ・カー');
    await insertMovie('m7', 'it', 'La visita');
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'm7',
      languageCode: 'it',
      content: 'La visita',
      isDefault: 0,
    });
  });

  it('原題フォールバックを原語の行へ移し、日本語訳があれば置き換え、それ以外は残す', async () => {
    const result = await fixJapaneseTitleContamination(
      {database, environment, isDryRun: false},
      {fetchDetails, throttleMs: 0},
    );

    expect(await jaTitleOf('m1')).toBeUndefined();
    expect(await titleOf('m1', 'fa')).toBe('کمی نور');
    expect(await jaTitleOf('m2')).toBe('羅生門');
    expect(await jaTitleOf('m3')).toBe('E.T.');
    expect(await jaTitleOf('m4')).toBe('בית אבי');
    expect(await jaTitleOf('m6')).toBe('ドライブ・マイ・カー');
    expect(result.scanned).toBe(5);
    expect(result.relocated).toBe(1);
    expect(result.deleted).toBe(1);
    expect(result.replaced).toBe(1);
    expect(result.kept).toBe(1);
    expect(result.unverified).toEqual([{movieUid: 'm4', content: 'בית אבי'}]);
  });

  it('原語の行が既にあれば ja の行は削除する', async () => {
    await fixJapaneseTitleContamination(
      {database, environment, isDryRun: false},
      {fetchDetails, throttleMs: 0},
    );

    expect(await jaTitleOf('m7')).toBeUndefined();
    expect(await titleOf('m7', 'it')).toBe('La visita');
  });

  it('soft-delete済みの映画は走査しない', async () => {
    const result = await fixJapaneseTitleContamination(
      {database, environment, isDryRun: false},
      {fetchDetails, throttleMs: 0},
    );

    expect(await jaTitleOf('m5')).toBe('Бег');
    expect(result.scanned).toBe(5);
  });

  it('2回目の実行では何も変えない', async () => {
    await fixJapaneseTitleContamination(
      {database, environment, isDryRun: false},
      {fetchDetails, throttleMs: 0},
    );
    const second = await fixJapaneseTitleContamination(
      {database, environment, isDryRun: false},
      {fetchDetails, throttleMs: 0},
    );

    expect(second.deleted).toBe(0);
    expect(second.relocated).toBe(0);
    expect(second.replaced).toBe(0);
  });

  it('dry-run では書き込まずに件数だけ返す', async () => {
    const result = await fixJapaneseTitleContamination(
      {
        database: getScrapeDatabase({environment, isDryRun: true}),
        environment,
        isDryRun: true,
      },
      {fetchDetails, throttleMs: 0},
    );

    expect(await jaTitleOf('m1')).toBe('کمی نور');
    expect(await jaTitleOf('m2')).toBe('Rashômon');
    expect(await jaTitleOf('m7')).toBe('La visita');
    expect(result.relocated).toBe(1);
    expect(result.deleted).toBe(1);
    expect(result.replaced).toBe(1);
  });

  it('--movie で1本だけ対象にできる', async () => {
    const result = await fixJapaneseTitleContamination(
      {database, environment, isDryRun: false},
      {fetchDetails, throttleMs: 0, movieUid: 'm2'},
    );

    expect(result.scanned).toBe(1);
    expect(await jaTitleOf('m1')).toBe('کمی نور');
    expect(await jaTitleOf('m2')).toBe('羅生門');
  });
});
