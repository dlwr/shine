/**
 * 日本語翻訳データの取得と保存を行うリポジトリモジュール
 */
import { D1Database } from "@cloudflare/workers-types";
import { movies, translations } from "db/schema";
import { and, eq } from "drizzle-orm";
import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";

/**
 * 日本語翻訳用の型定義
 */
export interface Movie {
  uid: string;
  imdbId: string;
  englishTitle: string;
  year?: number;
}

/**
 * 翻訳データの型定義
 */
export interface Translation {
  resourceType: string;
  resourceUid: string;
  languageCode: string;
  content: string;
  isDefault?: number;
}

/**
 * 日本語翻訳が未登録の映画データを取得する
 * @param db D1データベース
 * @param limit 取得件数
 * @returns 日本語翻訳が未登録の映画データ
 */
export async function getMoviesWithoutJapaneseTranslation(
  database: D1Database,
  limit = 20
): Promise<Movie[]> {
  const drizzleDatabase = drizzle(database, {
    casing: "snake_case",
  });

  // 英語タイトルを取得するために、まず英語の翻訳データを含む映画を取得
  const moviesWithEnglishTitles = await drizzleDatabase
    .select({
      movieUid: movies.uid,
      imdbId: movies.imdbId,
      year: movies.year,
    })
    .from(movies)
    .innerJoin(
      translations,
      and(
        eq(translations.resourceType, "movie_title"),
        eq(translations.resourceUid, movies.uid),
        eq(translations.languageCode, "en")
      )
    )
    .limit(limit * 5); // より多くのデータを取得して、後でフィルタリング

  // 映画UIDと英語タイトルのマッピングを作成
  const movieData = new Map();
  for (const movie of moviesWithEnglishTitles) {
    movieData.set(movie.movieUid, {
      uid: movie.movieUid,
      imdbId: movie.imdbId,
      year: movie.year,
    });
  }

  // 日本語翻訳が既に存在する映画を取得
  const moviesWithJapaneseTitles = await drizzleDatabase
    .select({
      movieUid: translations.resourceUid,
    })
    .from(translations)
    .where(
      and(
        eq(translations.resourceType, "movie_title"),
        eq(translations.languageCode, "ja")
      )
    );

  // 日本語翻訳が存在する映画UIDのセットを作成
  const japaneseMovieUids = new Set(
    moviesWithJapaneseTitles.map((movie) => movie.movieUid)
  );

  // 日本語翻訳が存在しない映画のみをフィルタリング
  const moviesWithoutJapanese = [...movieData.values()].filter(
    (movie) => !japaneseMovieUids.has(movie.uid)
  );

  // 英語タイトルを取得
  const result = [];
  for (const movie of moviesWithoutJapanese.slice(0, limit)) {
    const englishTitle = await getMovieTitle(drizzleDatabase, movie.uid, "en");
    if (englishTitle) {
      result.push({
        ...movie,
        englishTitle,
      });
    }
  }

  return result;
}

/**
 * 映画のタイトルを言語コードで取得する
 * @param drizzleDb Drizzleデータベース
 * @param movieUid 映画UID
 * @param languageCode 言語コード
 * @returns 映画タイトル
 */
async function getMovieTitle(
  drizzleDatabase: DrizzleD1Database,
  movieUid: string,
  languageCode: string
): Promise<string | undefined> {
  const result = await drizzleDatabase
    .select({
      content: translations.content,
    })
    .from(translations)
    .where(
      and(
        eq(translations.resourceType, "movie_title"),
        eq(translations.resourceUid, movieUid),
        eq(translations.languageCode, languageCode)
      )
    )
    .limit(1);

  return result.length > 0 ? result[0].content : undefined;
}

/**
 * 日本語翻訳をデータベースに保存する
 * @param db D1データベース
 * @param translation 翻訳データ
 * @returns 挿入結果
 */
export async function saveJapaneseTranslation(
  database: D1Database,
  translation: Translation
): Promise<unknown> {
  const drizzleDatabase = drizzle(database);

  // 既存の翻訳を確認
  const existingTranslation = await drizzleDatabase
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.resourceType, translation.resourceType),
        eq(translations.resourceUid, translation.resourceUid),
        eq(translations.languageCode, translation.languageCode)
      )
    )
    .limit(1);

  // UUIDの生成
  const uid = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  // 翻訳が存在しない場合は新規挿入、存在する場合は更新
  return existingTranslation.length === 0
    ? drizzleDatabase.insert(translations).values({
        uid,
        resourceType: translation.resourceType,
        resourceUid: translation.resourceUid,
        languageCode: translation.languageCode,
        content: translation.content,
        isDefault: translation.isDefault || 0,
        createdAt: now,
        updatedAt: now,
      })
    : drizzleDatabase
        .update(translations)
        .set({
          content: translation.content,
          updatedAt: now,
        })
        .where(
          and(
            eq(translations.resourceType, translation.resourceType),
            eq(translations.resourceUid, translation.resourceUid),
            eq(translations.languageCode, translation.languageCode)
          )
        );
}
