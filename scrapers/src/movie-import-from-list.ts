import { readFileSync } from "node:fs";
import { eq, or } from "drizzle-orm";
import { getDatabase, type Environment } from "../../src/index";
import { movies } from "../../src/schema/movies";
import { nominations } from "../../src/schema/nominations";
import { awardCategories } from "../../src/schema/award-categories";
import { awardCeremonies } from "../../src/schema/award-ceremonies";
import { awardOrganizations } from "../../src/schema/award-organizations";
import { posterUrls } from "../../src/schema/poster-urls";
import { translations } from "../../src/schema/translations";
import { referenceUrls } from "../../src/schema/reference-urls";
import { generateUUID } from "../../src/utils/uuid";

const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";

interface TMDBMovieData {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  poster_path: string | null;
  imdb_id: string | null;
  overview: string;
}

interface TMDBSearchResponse {
  results: TMDBMovieData[];
  total_results: number;
}

interface TMDBConfiguration {
  images: {
    secure_base_url: string;
    poster_sizes: string[];
  };
}

let environment_: Environment;
let TMDB_API_KEY: string;
let tmdbConfiguration: TMDBConfiguration | undefined;

/**
 * movie-list.jsonから映画をインポートする
 */
export async function importMoviesFromList(
  filePath: string,
  awardName: string,
  environment: Environment,
  limit?: number
): Promise<void> {
  environment_ = environment;
  TMDB_API_KEY = environment.TMDB_API_KEY;

  if (!TMDB_API_KEY) {
    throw new Error("TMDB_API_KEY is required");
  }

  // TMDB設定を取得
  await fetchTMDBConfiguration();

  // JSONファイルを読み込み
  const fileContent = readFileSync(filePath, "utf-8");
  const allMovieTitles: string[] = JSON.parse(fileContent);
  
  // limitが指定されている場合は制限
  const movieTitles = limit ? allMovieTitles.slice(0, limit) : allMovieTitles;

  console.log(`Importing ${movieTitles.length}${limit ? ` (limited from ${allMovieTitles.length})` : ''} movies from ${filePath}`);

  // アワード組織とカテゴリーを作成
  const { organizationUid, categoryUid, ceremonyUid } = 
    await createAwardStructure(awardName);

  // 各映画を処理
  for (const [index, title] of movieTitles.entries()) {
    console.log(`\n[${index + 1}/${movieTitles.length}] Processing: ${title}`);
    
    try {
      await processMovie(title, organizationUid, categoryUid, ceremonyUid);
    } catch (error) {
      console.error(`Error processing ${title}:`, error);
    }
  }

  console.log("\nImport completed!");
}

/**
 * アワード組織、カテゴリー、セレモニーを作成
 */
async function createAwardStructure(awardName: string): Promise<{
  organizationUid: string;
  categoryUid: string;
  ceremonyUid: string;
}> {
  const database = getDatabase(environment_);

  // 組織を作成/取得
  await database
    .insert(awardOrganizations)
    .values({
      name: awardName,
      country: "Unknown",
      establishedYear: null,
    })
    .onConflictDoNothing();

  const [organization] = await database
    .select()
    .from(awardOrganizations)
    .where(eq(awardOrganizations.name, awardName));

  if (!organization) {
    throw new Error(`Failed to create organization: ${awardName}`);
  }

  // カテゴリーを作成/取得
  const categoryName = "Selected Films";
  await database
    .insert(awardCategories)
    .values({
      organizationUid: organization.uid,
      name: categoryName,
      shortName: categoryName,
    })
    .onConflictDoNothing();

  const [category] = await database
    .select()
    .from(awardCategories)
    .where(eq(awardCategories.name, categoryName));

  if (!category) {
    throw new Error(`Failed to create category: ${categoryName}`);
  }

  // セレモニーを作成/取得
  const currentYear = new Date().getFullYear();
  await database
    .insert(awardCeremonies)
    .values({
      organizationUid: organization.uid,
      year: currentYear,
      date: new Date().toISOString().split("T")[0],
    })
    .onConflictDoNothing();

  const [ceremony] = await database
    .select()
    .from(awardCeremonies)
    .where(eq(awardCeremonies.year, currentYear));

  if (!ceremony) {
    throw new Error(`Failed to create ceremony for year: ${currentYear}`);
  }

  return {
    organizationUid: organization.uid,
    categoryUid: category.uid,
    ceremonyUid: ceremony.uid,
  };
}

/**
 * 単一の映画を処理
 */
async function processMovie(
  title: string,
  organizationUid: string,
  categoryUid: string,
  ceremonyUid: string
): Promise<void> {
  const database = getDatabase(environment_);

  // TMDBで映画を検索
  const tmdbMovie = await searchMovieOnTMDB(title);
  
  if (!tmdbMovie) {
    console.log(`  TMDB search failed for: ${title}`);
    return;
  }

  // 既存の映画をチェック（TMDB IDまたはIMDb IDで）
  let existingMovie = null;
  
  if (tmdbMovie.imdb_id) {
    [existingMovie] = await database
      .select()
      .from(movies)
      .where(
        or(
          eq(movies.tmdbId, tmdbMovie.id),
          eq(movies.imdbId, tmdbMovie.imdb_id)
        )
      )
      .limit(1);
  } else {
    [existingMovie] = await database
      .select()
      .from(movies)
      .where(eq(movies.tmdbId, tmdbMovie.id))
      .limit(1);
  }

  let movieUid: string;

  if (existingMovie) {
    console.log(`  Found existing movie: ${existingMovie.title}`);
    movieUid = existingMovie.uid;
    
    // TMDBデータで既存映画を更新
    await updateExistingMovie(existingMovie.uid, tmdbMovie);
  } else {
    console.log(`  Creating new movie: ${tmdbMovie.title}`);
    movieUid = await createNewMovie(tmdbMovie);
  }

  // ノミネーションを追加
  await addNomination(movieUid, categoryUid, ceremonyUid);
}

/**
 * TMDBで映画を検索
 */
async function searchMovieOnTMDB(title: string): Promise<TMDBMovieData | null> {
  try {
    const searchUrl = new URL(`${TMDB_API_BASE_URL}/search/movie`);
    searchUrl.searchParams.append("api_key", TMDB_API_KEY);
    searchUrl.searchParams.append("query", title);
    searchUrl.searchParams.append("language", "ja");

    const response = await fetch(searchUrl.toString());
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.statusText}`);
    }

    const data = (await response.json()) as TMDBSearchResponse;
    
    if (data.results.length === 0) {
      return null;
    }

    // 最初の結果を返す（最も関連性が高いとされる）
    const movie = data.results[0];
    console.log(`  Found on TMDB: ${movie.title} (${movie.release_date?.split("-")[0] || "Unknown"})`);
    
    return movie;
  } catch (error) {
    console.error(`Error searching TMDB for ${title}:`, error);
    return null;
  }
}

/**
 * 新しい映画を作成
 */
async function createNewMovie(tmdbMovie: TMDBMovieData): Promise<string> {
  const database = getDatabase(environment_);
  const movieUid = generateUUID();

  // 公開年を抽出
  const releaseYear = tmdbMovie.release_date
    ? Number.parseInt(tmdbMovie.release_date.split("-")[0], 10)
    : null;

  // 映画を作成
  await database.insert(movies).values({
    uid: movieUid,
    title: tmdbMovie.title,
    originalTitle: tmdbMovie.original_title,
    releaseYear,
    tmdbId: tmdbMovie.id,
    imdbId: tmdbMovie.imdb_id,
  });

  // 日本語翻訳を追加
  if (tmdbMovie.title !== tmdbMovie.original_title) {
    await database.insert(translations).values({
      resourceType: "movie",
      resourceUid: movieUid,
      languageCode: "ja",
      content: `title:${tmdbMovie.title}`,
    });
  }

  // 概要を追加
  if (tmdbMovie.overview) {
    await database.insert(translations).values({
      resourceType: "movie",
      resourceUid: movieUid,
      languageCode: "ja",
      content: `overview:${tmdbMovie.overview}`,
    });
  }

  // ポスターURLを追加
  if (tmdbMovie.poster_path && tmdbConfiguration) {
    const posterUrl = `${tmdbConfiguration.images.secure_base_url}w500${tmdbMovie.poster_path}`;
    await database.insert(posterUrls).values({
      movieUid,
      url: posterUrl,
      source: "tmdb",
    });
  }

  return movieUid;
}

/**
 * 既存の映画を更新
 */
async function updateExistingMovie(
  movieUid: string,
  tmdbMovie: TMDBMovieData
): Promise<void> {
  const database = getDatabase(environment_);

  // TMDBデータで更新
  const updates: Partial<typeof movies.$inferInsert> = {};
  
  if (!await hasValue(movieUid, "tmdbId")) {
    updates.tmdbId = tmdbMovie.id;
  }
  
  if (!await hasValue(movieUid, "imdbId") && tmdbMovie.imdb_id) {
    updates.imdbId = tmdbMovie.imdb_id;
  }

  if (Object.keys(updates).length > 0) {
    await database.update(movies).set(updates).where(eq(movies.uid, movieUid));
  }

  // ポスターURLを追加（まだない場合）
  if (tmdbMovie.poster_path && tmdbConfiguration) {
    const [existingPoster] = await database
      .select()
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, movieUid))
      .limit(1);

    if (!existingPoster) {
      const posterUrl = `${tmdbConfiguration.images.secure_base_url}w500${tmdbMovie.poster_path}`;
      await database.insert(posterUrls).values({
        movieUid,
        url: posterUrl,
        source: "tmdb",
      });
    }
  }
}

/**
 * 指定フィールドに値があるかチェック
 */
async function hasValue(movieUid: string, field: keyof typeof movies.$inferSelect): Promise<boolean> {
  const database = getDatabase(environment_);
  const [movie] = await database
    .select({ [field]: movies[field] })
    .from(movies)
    .where(eq(movies.uid, movieUid))
    .limit(1);
  
  return movie && movie[field] != null;
}

/**
 * ノミネーションを追加
 */
async function addNomination(
  movieUid: string,
  categoryUid: string,
  ceremonyUid: string
): Promise<void> {
  const database = getDatabase(environment_);

  // 既存のノミネーションをチェック
  const [existingNomination] = await database
    .select()
    .from(nominations)
    .where(
      eq(nominations.movieUid, movieUid) &&
      eq(nominations.categoryUid, categoryUid) &&
      eq(nominations.ceremonyUid, ceremonyUid)
    )
    .limit(1);

  if (existingNomination) {
    console.log(`  Nomination already exists`);
    return;
  }

  // ノミネーションを追加
  await database.insert(nominations).values({
    movieUid,
    categoryUid,
    ceremonyUid,
    isWinner: false, // デフォルトはノミネートのみ
  });

  console.log(`  Added nomination`);
}

/**
 * TMDB設定を取得
 */
async function fetchTMDBConfiguration(): Promise<void> {
  try {
    const configUrl = new URL(`${TMDB_API_BASE_URL}/configuration`);
    configUrl.searchParams.append("api_key", TMDB_API_KEY);

    const response = await fetch(configUrl.toString());
    if (!response.ok) {
      throw new Error(`TMDB configuration API error: ${response.statusText}`);
    }

    tmdbConfiguration = (await response.json()) as TMDBConfiguration;
    console.log("TMDB configuration loaded");
  } catch (error) {
    console.error("Error fetching TMDB configuration:", error);
    throw error;
  }
}