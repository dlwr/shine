/**
 * 日本語翻訳データの取得と保存を行うリポジトリモジュール
 */
import {and, eq, isNull} from 'drizzle-orm';
import {type getDatabase} from '@shine/database';
import {movies, translations} from '@shine/database/schema/index';
import {selectMoviesNeedingJapaneseTitle} from './select-targets';

/**
 * 日本語翻訳用の型定義
 */
export type Movie = {
  uid: string;
  /** movies.imdb_id は NULL 許容。無効値のまま外部検索に渡さないこと */
  imdbId: string | undefined;
  englishTitle: string;
  year?: number;
  tmdbId: number | undefined;
};

/**
 * 翻訳データの型定義
 */
export type Translation = {
  resourceType: 'movie_title' | 'movie_description';
  resourceUid: string;
  languageCode: string;
  content: string;
  isDefault?: number;
};

/**
 * 日本語翻訳が未登録の映画データを取得する
 * @param database Drizzleデータベース
 * @param limit 取得件数（0の場合は全件取得）
 * @param shouldIncludeNonJapanese 原題がそのまま ja として保存されている映画も含める
 * @returns 取得対象の映画データ
 */
export async function getMoviesWithoutJapaneseTranslation(
  database: ReturnType<typeof getDatabase>,
  limit = 20,
  shouldIncludeNonJapanese = false,
): Promise<Movie[]> {
  // 英語タイトルを取得するために、まず英語の翻訳データを含む映画を取得
  const moviesWithEnglishTitlesQuery = database
    .select({
      movieUid: movies.uid,
      imdbId: movies.imdbId,
      year: movies.year,
      tmdbId: movies.tmdbId,
      englishTitle: translations.content,
    })
    .from(movies)
    .innerJoin(
      translations,
      and(
        eq(translations.resourceType, 'movie_title'),
        eq(translations.resourceUid, movies.uid),
        eq(translations.languageCode, 'en'),
      ),
    )
    .where(isNull(movies.deletedAt));

  // Limitが0の場合は全件取得、それ以外は指定された件数の5倍取得（後でフィルタリング）
  const moviesWithEnglishTitles =
    limit === 0
      ? await moviesWithEnglishTitlesQuery
      : await moviesWithEnglishTitlesQuery.limit(limit * 5);

  // 映画UIDと英語タイトルのマッピングを作成
  // englishTitle は上のJOINで取得済み（1件ずつ引き直すとN+1になる）
  const movieData = new Map<string, Movie>();
  for (const movie of moviesWithEnglishTitles) {
    if (!movie.englishTitle) {
      continue;
    }

    movieData.set(movie.movieUid, {
      uid: movie.movieUid,
      imdbId: movie.imdbId ?? undefined,
      year: movie.year ?? undefined,
      tmdbId: movie.tmdbId ?? undefined,
      englishTitle: movie.englishTitle,
    });
  }

  // 日本語翻訳が既に存在する映画を取得
  const moviesWithJapaneseTitles = await database
    .select({
      movieUid: translations.resourceUid,
      content: translations.content,
    })
    .from(translations)
    .where(
      and(
        eq(translations.resourceType, 'movie_title'),
        eq(translations.languageCode, 'ja'),
      ),
    );

  const moviesWithoutJapanese = selectMoviesNeedingJapaneseTitle(
    movieData.values().toArray(),
    moviesWithJapaneseTitles,
    {shouldIncludeNonJapanese},
  );

  return limit === 0
    ? moviesWithoutJapanese
    : moviesWithoutJapanese.slice(0, limit);
}

/**
 * 日本語翻訳をデータベースに保存する
 * @param db D1データベース
 * @param translation 翻訳データ
 * @returns 挿入結果
 */
export async function saveJapaneseTranslation(
  database: ReturnType<typeof getDatabase>,
  translation: Translation,
): Promise<unknown> {
  // 既存の翻訳を確認
  const existingTranslation = await database
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.resourceType, translation.resourceType),
        eq(translations.resourceUid, translation.resourceUid),
        eq(translations.languageCode, translation.languageCode),
      ),
    )
    .limit(1);

  // UUIDの生成
  const uid = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  // 翻訳が存在しない場合は新規挿入、存在する場合は更新
  return existingTranslation.length === 0
    ? database.insert(translations).values({
        uid,
        resourceType: translation.resourceType,
        resourceUid: translation.resourceUid,
        languageCode: translation.languageCode,
        content: translation.content,
        isDefault: translation.isDefault || 0,
        createdAt: now,
      })
    : database
        .update(translations)
        .set({
          content: translation.content,
        })
        .where(
          and(
            eq(translations.resourceType, translation.resourceType),
            eq(translations.resourceUid, translation.resourceUid),
            eq(translations.languageCode, translation.languageCode),
          ),
        );
}

/**
 * 日本語翻訳をバッチでデータベースに保存する
 * @param database D1データベース
 * @param translationsBatch 翻訳データの配列
 * @returns 挿入結果
 */
export async function saveJapaneseTranslationsBatch(
  database: ReturnType<typeof getDatabase>,
  translationsBatch: Translation[],
): Promise<void> {
  if (translationsBatch.length === 0) {
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const translationsToInsert = [];

  // 既存の翻訳をチェック
  for (const translation of translationsBatch) {
    const existingTranslation = await database
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.resourceType, translation.resourceType),
          eq(translations.resourceUid, translation.resourceUid),
          eq(translations.languageCode, translation.languageCode),
        ),
      )
      .limit(1);

    // 翻訳が存在しない場合のみ挿入対象に追加
    if (existingTranslation.length === 0) {
      const uid = crypto.randomUUID();
      translationsToInsert.push({
        uid,
        resourceType: translation.resourceType,
        resourceUid: translation.resourceUid,
        languageCode: translation.languageCode,
        content: translation.content,
        isDefault: translation.isDefault || 0,
        createdAt: now,
      });
    } else {
      // 既存の場合は更新（バッチ更新は複雑なので個別に実行）
      await database
        .update(translations)
        .set({
          content: translation.content,
        })
        .where(
          and(
            eq(translations.resourceType, translation.resourceType),
            eq(translations.resourceUid, translation.resourceUid),
            eq(translations.languageCode, translation.languageCode),
          ),
        );
    }
  }

  // バッチ挿入
  if (translationsToInsert.length > 0) {
    await database.insert(translations).values(translationsToInsert);
    console.log(
      `Batch inserted ${translationsToInsert.length} new translations`,
    );
  }
}
