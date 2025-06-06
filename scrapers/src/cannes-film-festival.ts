import * as cheerio from "cheerio";
import { getDatabase, type Environment } from "../../src/index";
import { awardCategories } from "../../src/schema/award-categories";
import { awardCeremonies } from "../../src/schema/award-ceremonies";
import { awardOrganizations } from "../../src/schema/award-organizations";
import { movies } from "../../src/schema/movies";
import { nominations } from "../../src/schema/nominations";
import { referenceUrls } from "../../src/schema/reference-urls";
import { translations } from "../../src/schema/translations";
import { Element } from "domhandler";
import { and, eq } from "drizzle-orm";

const WIKIPEDIA_BASE_URL = "https://en.wikipedia.org";
const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";

interface MovieInfo {
  title: string;
  year: number;
  isWinner: boolean;
  referenceUrl?: string;
  director?: string;
  country?: string;
}

interface MasterData {
  organizationUid: string;
  palmeDorCategoryUid: string;
  grandPrixCategoryUid: string;
  ceremonies: Map<number, string>;
}

let masterData: MasterData | undefined;
let environment_: Environment;
let TMDB_API_KEY: string | undefined;

export default {
  async fetch(request: Request, environment: Environment): Promise<Response> {
    environment_ = environment;
    TMDB_API_KEY = environment.TMDB_API_KEY;

    try {
      await scrapeCannesFilmFestival();
      return new Response("Scraping completed successfully", { status: 200 });
    } catch (error) {
      return new Response(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        { status: 500 }
      );
    }
  },
};

async function seedCannesOrganization(): Promise<void> {
  const database = getDatabase(environment_);
  
  // カンヌ映画祭の組織を作成
  await database
    .insert(awardOrganizations)
    .values({
      name: "Cannes Film Festival",
      localName: "Festival de Cannes",
      country: "France",
      foundedYear: 1946,
    })
    .onConflictDoNothing();

  const [organization] = await database
    .select()
    .from(awardOrganizations)
    .where(eq(awardOrganizations.name, "Cannes Film Festival"));

  if (!organization) {
    throw new Error("Failed to create Cannes Film Festival organization");
  }

  // Palme d'Or カテゴリーを作成
  await database
    .insert(awardCategories)
    .values({
      organizationUid: organization.uid,
      name: "Palme d'Or",
      shortName: "Palme d'Or",
      displayOrder: 1,
    })
    .onConflictDoNothing();

  // Grand Prix カテゴリーを作成
  await database
    .insert(awardCategories)
    .values({
      organizationUid: organization.uid,
      name: "Grand Prix",
      shortName: "Grand Prix",
      displayOrder: 2,
    })
    .onConflictDoNothing();
}

async function fetchMasterData(): Promise<MasterData> {
  if (masterData) return masterData;

  // 組織が存在しない場合は作成
  await seedCannesOrganization();

  const [organization] = await getDatabase(environment_)
    .select()
    .from(awardOrganizations)
    .where(eq(awardOrganizations.name, "Cannes Film Festival"));

  if (!organization) {
    throw new Error("Cannes Film Festival organization not found");
  }

  const categories = await getDatabase(environment_)
    .select()
    .from(awardCategories)
    .where(eq(awardCategories.organizationUid, organization.uid));

  const palmeDor = categories.find(cat => cat.shortName === "Palme d'Or");
  const grandPrix = categories.find(cat => cat.shortName === "Grand Prix");

  if (!palmeDor || !grandPrix) {
    throw new Error("Required categories not found");
  }

  const ceremoniesData = await getDatabase(environment_)
    .select()
    .from(awardCeremonies)
    .where(eq(awardCeremonies.organizationUid, organization.uid));

  const ceremonies = new Map<number, string>(
    ceremoniesData.map((ceremony) => [ceremony.year as number, ceremony.uid])
  );

  masterData = {
    organizationUid: organization.uid,
    palmeDorCategoryUid: palmeDor.uid,
    grandPrixCategoryUid: grandPrix.uid,
    ceremonies,
  };

  return masterData;
}

async function getOrCreateCeremony(
  year: number,
  organizationUid: string
): Promise<string> {
  const database = getDatabase(environment_);
  const [ceremony] = await database
    .insert(awardCeremonies)
    .values({
      organizationUid,
      year,
      ceremonyNumber: year - 1946 + 1, // カンヌ映画祭は1946年開始
    })
    .onConflictDoUpdate({
      target: [awardCeremonies.organizationUid, awardCeremonies.year],
      set: {
        ceremonyNumber: year - 1946 + 1,
        updatedAt: Math.floor(Date.now() / 1000),
      },
    })
    .returning();

  masterData?.ceremonies.set(year, ceremony.uid);

  return ceremony.uid;
}

export async function scrapeCannesFilmFestival() {
  try {
    const master = await fetchMasterData();
    
    // 各年のカンヌ映画祭をスクレイピング
    const currentYear = new Date().getFullYear();
    for (let year = currentYear; year >= 1946; year--) {
      console.log(`\nProcessing Cannes ${year}...`);
      
      try {
        const movies = await scrapeYearPage(year);
        
        for (const movie of movies) {
          await processMovie(
            movie,
            await getOrCreateCeremony(year, master.organizationUid),
            master
          );
        }
        
        console.log(`Processed ${movies.length} movies for ${year}`);
      } catch (error) {
        console.error(`Error processing year ${year}:`, error);
        // Continue with next year
      }
      
      // 短い遅延を入れてサーバーに負荷をかけないようにする
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log("Cannes Film Festival scraping completed successfully");
  } catch (error) {
    console.error("Error scraping Cannes Film Festival:", error);
    throw error;
  }
}

async function scrapeYearPage(year: number): Promise<MovieInfo[]> {
  // まず年ごとのカンヌ映画祭のページを取得
  const yearUrl = `${WIKIPEDIA_BASE_URL}/wiki/${year}_Cannes_Film_Festival`;
  
  console.log(`Fetching ${yearUrl}...`);
  const response = await fetch(yearUrl);
  
  if (!response.ok) {
    console.log(`Page not found for ${year}, skipping...`);
    return [];
  }
  
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const movies: MovieInfo[] = [];
  
  // In Competition セクションを探す
  const competitionSection = findCompetitionSection($);
  if (!competitionSection) {
    console.log(`No competition section found for ${year}`);
    return movies;
  }
  
  // 映画リストを取得
  const movieList = extractMoviesFromSection($, competitionSection, year);
  movies.push(...movieList);
  
  // Palme d'Or 受賞作を特定
  const palmeDorWinner = findPalmeDorWinner($, year);
  if (palmeDorWinner) {
    // 既存のリストから該当する映画を見つけて更新
    const existingMovie = movies.find(m => m.title === palmeDorWinner.title);
    if (existingMovie) {
      existingMovie.isWinner = true;
    } else {
      movies.push(palmeDorWinner);
    }
  }
  
  return movies;
}

function findCompetitionSection($: cheerio.CheerioAPI): cheerio.Cheerio<Element> | null {
  // "In Competition" または "Official selection" セクションを探す
  const headings = $("h2, h3, h4");
  
  for (let i = 0; i < headings.length; i++) {
    const heading = $(headings[i]);
    const text = heading.text().toLowerCase();
    
    if (text.includes("in competition") || text.includes("official selection") || text.includes("main competition")) {
      // 次の要素からリストを探す
      let nextElement = heading.next();
      
      while (nextElement.length > 0) {
        if (nextElement.is("ul, ol, table")) {
          return nextElement;
        }
        
        // 次のヘッダーに到達したら終了
        if (nextElement.is("h2, h3, h4")) {
          break;
        }
        
        nextElement = nextElement.next();
      }
    }
  }
  
  return null;
}

function extractMoviesFromSection(
  $: cheerio.CheerioAPI,
  section: cheerio.Cheerio<Element>,
  year: number
): MovieInfo[] {
  const movies: MovieInfo[] = [];
  
  if (section.is("ul, ol")) {
    // リスト形式の場合
    section.find("li").each((_, element) => {
      const movieInfo = parseMovieListItem($, $(element), year);
      if (movieInfo) {
        movies.push(movieInfo);
      }
    });
  } else if (section.is("table")) {
    // テーブル形式の場合
    section.find("tr").each((index, element) => {
      if (index === 0) return; // ヘッダー行をスキップ
      
      const movieInfo = parseMovieTableRow($, $(element), year);
      if (movieInfo) {
        movies.push(movieInfo);
      }
    });
  }
  
  return movies;
}

function parseMovieListItem(
  $: cheerio.CheerioAPI,
  $item: cheerio.Cheerio<Element>,
  year: number
): MovieInfo | null {
  const text = $item.text();
  
  // イタリック体のタイトルを探す
  const titleElement = $item.find("i").first();
  const linkElement = $item.find("a").first();
  
  let title = "";
  let referenceUrl: string | undefined;
  
  if (titleElement.length > 0) {
    title = titleElement.text().trim();
  } else if (linkElement.length > 0) {
    title = linkElement.text().trim();
    const href = linkElement.attr("href");
    if (href) {
      referenceUrl = `${WIKIPEDIA_BASE_URL}${href}`;
    }
  } else {
    // タイトルをテキストから抽出
    const match = text.match(/^([^–—-]+)/);
    if (match) {
      title = match[1].trim();
    }
  }
  
  if (!title) return null;
  
  // 監督を抽出
  let director: string | undefined;
  const directorMatch = text.match(/(?:directed by|by|–|—)\s*([^,\n]+)/i);
  if (directorMatch) {
    director = directorMatch[1].trim();
  }
  
  return {
    title: cleanupTitle(title),
    year,
    isWinner: false,
    referenceUrl,
    director,
  };
}

function parseMovieTableRow(
  $: cheerio.CheerioAPI,
  $row: cheerio.Cheerio<Element>,
  year: number
): MovieInfo | null {
  const cells = $row.find("td");
  if (cells.length < 2) return null;
  
  // 通常、最初のセルがタイトル、2番目が監督
  const titleCell = cells.eq(0);
  const directorCell = cells.eq(1);
  
  const titleElement = titleCell.find("i").first();
  const linkElement = titleCell.find("a").first();
  
  let title = "";
  let referenceUrl: string | undefined;
  
  if (titleElement.length > 0) {
    title = titleElement.text().trim();
  } else if (linkElement.length > 0) {
    title = linkElement.text().trim();
    const href = linkElement.attr("href");
    if (href) {
      referenceUrl = `${WIKIPEDIA_BASE_URL}${href}`;
    }
  } else {
    title = titleCell.text().trim();
  }
  
  if (!title) return null;
  
  const director = directorCell.text().trim() || undefined;
  
  return {
    title: cleanupTitle(title),
    year,
    isWinner: false,
    referenceUrl,
    director,
  };
}

function findPalmeDorWinner($: cheerio.CheerioAPI, year: number): MovieInfo | null {
  // Palme d'Or セクションを探す
  const infobox = $(".infobox");
  
  if (infobox.length > 0) {
    const rows = infobox.find("tr");
    
    for (let i = 0; i < rows.length; i++) {
      const row = $(rows[i]);
      const header = row.find("th").text().toLowerCase();
      
      if (header.includes("palme d'or")) {
        const valueCell = row.find("td");
        const titleElement = valueCell.find("i").first();
        const linkElement = valueCell.find("a").first();
        
        let title = "";
        let referenceUrl: string | undefined;
        
        if (titleElement.length > 0) {
          title = titleElement.text().trim();
        } else if (linkElement.length > 0) {
          title = linkElement.text().trim();
          const href = linkElement.attr("href");
          if (href) {
            referenceUrl = `${WIKIPEDIA_BASE_URL}${href}`;
          }
        }
        
        if (title) {
          return {
            title: cleanupTitle(title),
            year,
            isWinner: true,
            referenceUrl,
          };
        }
      }
    }
  }
  
  return null;
}

function cleanupTitle(title: string): string {
  return title
    .replaceAll(/\s*\([^)]*\)/g, "")
    .replaceAll(/\s*\[[^\]]*\]/g, "")
    .replaceAll('*', "")
    .trim();
}

// TMDb APIのレスポンス型
interface TMDatabaseSearchResponse {
  results: {
    id: number;
    title: string;
    original_title: string;
    release_date: string;
  }[];
}

interface TMDatabaseMovieDetails {
  imdb_id: string;
  title: string;
  original_title: string;
  release_date: string;
}

async function searchTMDatabaseMovie(
  title: string,
  year: number
): Promise<number | undefined> {
  if (!TMDB_API_KEY) {
    console.error("TMDb API key is not set");
    return undefined;
  }

  try {
    const searchUrl = new URL(`${TMDB_API_BASE_URL}/search/movie`);
    searchUrl.searchParams.append("api_key", TMDB_API_KEY);
    searchUrl.searchParams.append("query", title);
    searchUrl.searchParams.append("year", year.toString());
    searchUrl.searchParams.append("language", "en-US");

    const response = await fetch(searchUrl.toString());
    if (!response.ok) {
      throw new Error(`TMDb API error: ${response.statusText}`);
    }

    const data = (await response.json()) as TMDatabaseSearchResponse;

    // 結果をフィルタリング
    const matches = data.results.filter((movie) => {
      const movieYear = new Date(movie.release_date).getFullYear();
      return Math.abs(movieYear - year) <= 1; // 1年の誤差を許容
    });

    // 最も関連性の高い結果を返す
    return matches.length > 0 ? matches[0].id : undefined;
  } catch (error) {
    console.error(`Error searching TMDb for ${title} (${year}):`, error);
    return undefined;
  }
}

async function fetchTMDatabaseMovieDetails(
  movieId: number
): Promise<string | undefined> {
  if (!TMDB_API_KEY) {
    console.error("TMDb API key is not set");
    return undefined;
  }

  try {
    const detailsUrl = new URL(`${TMDB_API_BASE_URL}/movie/${movieId}`);
    detailsUrl.searchParams.append("api_key", TMDB_API_KEY);
    detailsUrl.searchParams.append("language", "en-US");

    const response = await fetch(detailsUrl.toString());
    if (!response.ok) {
      throw new Error(`TMDb API error: ${response.statusText}`);
    }

    const data = (await response.json()) as TMDatabaseMovieDetails;
    return data.imdb_id || undefined;
  } catch (error) {
    console.error(
      `Error fetching TMDb movie details for ID ${movieId}:`,
      error
    );
    return undefined;
  }
}

async function fetchImdbId(
  title: string,
  year: number
): Promise<string | undefined> {
  try {
    // TMDbで映画を検索
    const movieId = await searchTMDatabaseMovie(title, year);
    if (!movieId) {
      console.log(`No TMDb match found for ${title} (${year})`);
      return undefined;
    }

    // 映画の詳細情報を取得
    const imdbId = await fetchTMDatabaseMovieDetails(movieId);
    if (imdbId) {
      console.log(`Found IMDb ID for ${title} (${year}): ${imdbId}`);
    } else {
      console.log(`No IMDb ID found for ${title} (${year})`);
    }

    return imdbId;
  } catch (error) {
    console.error(`Error fetching IMDb ID for ${title} (${year}):`, error);
    return undefined;
  }
}

async function processMovie(
  movieInfo: MovieInfo,
  ceremonyUid: string,
  master: MasterData
) {
  try {
    const database = getDatabase(environment_);

    // IMDb IDを取得
    const imdbId = await fetchImdbId(movieInfo.title, movieInfo.year);

    // 既存の映画を検索
    const existingMovies = await database
      .select({
        movies: movies,
        translations: translations,
      })
      .from(movies)
      .innerJoin(
        translations,
        and(
          eq(translations.resourceUid, movies.uid),
          eq(translations.resourceType, "movie_title"),
          eq(translations.languageCode, "en"),
          eq(translations.isDefault, 1)
        )
      )
      .where(eq(translations.content, movieInfo.title));

    let movieUid: string;

    if (existingMovies.length > 0) {
      // 既存の映画が見つかった場合は更新
      const existingMovie = existingMovies[0].movies;
      movieUid = existingMovie.uid;

      // IMDb IDが新しく取得できた場合は更新
      if (imdbId && !existingMovie.imdbId) {
        await database
          .update(movies)
          .set({
            imdbId,
            updatedAt: Math.floor(Date.now() / 1000),
          })
          .where(eq(movies.uid, movieUid));
        console.log(`Updated IMDb ID for ${movieInfo.title}: ${imdbId}`);
      }
    } else {
      // 新規映画の作成
      const [newMovie] = await database
        .insert(movies)
        .values({
          originalLanguage: "en",
          year: movieInfo.year,
          imdbId: imdbId || undefined,
        })
        .returning();

      if (!newMovie) {
        throw new Error(`Failed to create movie: ${movieInfo.title}`);
      }
      movieUid = newMovie.uid;

      await database.insert(translations).values({
        resourceType: "movie_title",
        resourceUid: movieUid,
        languageCode: "en",
        content: movieInfo.title,
        isDefault: 1,
      });
    }

    // 参照URLの更新または追加
    if (movieInfo.referenceUrl) {
      await database
        .insert(referenceUrls)
        .values({
          movieUid,
          url: movieInfo.referenceUrl,
          sourceType: "wikipedia",
          languageCode: "en",
          isPrimary: 1,
        })
        .onConflictDoUpdate({
          target: [
            referenceUrls.movieUid,
            referenceUrls.sourceType,
            referenceUrls.languageCode,
          ],
          set: {
            url: movieInfo.referenceUrl,
            updatedAt: Math.floor(Date.now() / 1000),
          },
        });
    }

    // ノミネーション情報の更新または追加
    const categoryUid = movieInfo.isWinner 
      ? master.palmeDorCategoryUid 
      : master.palmeDorCategoryUid; // コンペティション参加作品もPalme d'Orカテゴリーに登録
    
    await database
      .insert(nominations)
      .values({
        movieUid: movieUid,
        ceremonyUid,
        categoryUid,
        isWinner: movieInfo.isWinner ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: [
          nominations.movieUid,
          nominations.ceremonyUid,
          nominations.categoryUid,
        ],
        set: {
          isWinner: movieInfo.isWinner ? 1 : 0,
          updatedAt: Math.floor(Date.now() / 1000),
        },
      });

    console.log(
      `Processed ${existingMovies.length > 0 ? "updated" : "new"} movie: ${movieInfo.title} (${movieInfo.year}) - ${
        movieInfo.isWinner ? "Palme d'Or Winner" : "In Competition"
      } ${imdbId ? `IMDb: ${imdbId}` : ""}`
    );
  } catch (error) {
    console.error(`Error processing movie ${movieInfo.title}:`, error);
    throw error;
  }
}