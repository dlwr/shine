import { seedAcademyAwards } from "@shine/db/seeds/academy-awards";
import * as cheerio from "cheerio";
import { getDatabase, type Environment } from "../../db";
import { awardCategories } from "../../db/schema/award-categories";
import { awardCeremonies } from "../../db/schema/award-ceremonies";
import { awardOrganizations } from "../../db/schema/award-organizations";
import { movies } from "../../db/schema/movies";
import { nominations } from "../../db/schema/nominations";
import { referenceUrls } from "../../db/schema/reference-urls";
import { translations } from "../../db/schema/translations";
import { Element } from "domhandler";
import { and, eq } from "drizzle-orm";

const WIKIPEDIA_BASE_URL = "https://en.wikipedia.org";
const ACADEMY_AWARDS_URL = `${WIKIPEDIA_BASE_URL}/wiki/Academy_Award_for_Best_Picture`;
const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";

interface TableColumns {
  filmIndex: number;
  yearIndex: number;
  producerIndex: number;
  tableType: "film" | "producer" | "unknown";
}

interface MovieInfo {
  title: string;
  year: number;
  isWinner: boolean;
  referenceUrl?: string;
  imdbId?: string;
}

interface MasterData {
  organizationUid: string;
  categoryUid: string;
  ceremonies: Map<number, string>;
}

let masterData: MasterData | undefined;
let environment_: Environment;
let TMDB_API_KEY: string | undefined;

export default {
  async fetch(request: Request, environment: Environment): Promise<Response> {
    environment_ = environment;
    TMDB_API_KEY = environment.TMDB_API_KEY;

    const url = new URL(request.url);
    if (url.pathname === "/seed") {
      console.log("seeding academy awards");
      await seedAcademyAwards(environment_);
      return new Response("Seed completed successfully", { status: 200 });
    }

    try {
      await scrapeAcademyAwards();
      return new Response("Scraping completed successfully", { status: 200 });
    } catch (error) {
      return new Response(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        { status: 500 }
      );
    }
  },
};

async function fetchMasterData(): Promise<MasterData> {
  if (masterData) return masterData;

  const [organization] = await getDatabase(environment_)
    .select()
    .from(awardOrganizations)
    .where(eq(awardOrganizations.name, "Academy Awards"));

  if (!organization) {
    throw new Error("Academy Awards organization not found");
  }

  const [category] = await getDatabase(environment_)
    .select()
    .from(awardCategories)
    .where(eq(awardCategories.shortName, "Best Picture"));

  if (!category) {
    throw new Error("Best Picture category not found");
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
    categoryUid: category.uid,
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
      ceremonyNumber: year - 1928 + 1,
    })
    .onConflictDoUpdate({
      target: [awardCeremonies.organizationUid, awardCeremonies.year],
      set: {
        ceremonyNumber: year - 1928 + 1,
        updatedAt: Math.floor(Date.now() / 1000),
      },
    })
    .returning();

  masterData?.ceremonies.set(year, ceremony.uid);

  return ceremony.uid;
}

export async function scrapeAcademyAwards() {
  try {
    console.log("Fetching data from Wikipedia...");
    const response = await fetch(ACADEMY_AWARDS_URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    const allTables = [...$("table.wikitable.sortable")];
    console.log(`Found ${allTables.length} wikitable.sortable tables`);

    let moviesProcessed = 0;
    let winnersProcessed = 0;

    for (const [tableIndex, table] of allTables.entries()) {
      const tableInfo = analyzeTableStructure($, $(table), tableIndex);

      if (!tableInfo || tableInfo.tableType === "unknown") continue;

      const movies = processTableRows($, $(table));

      for (const movie of movies) {
        await processMovie(
          movie.title,
          movie.year,
          movie.isWinner,
          movie.referenceUrl
        );
        moviesProcessed++;
        if (movie.isWinner) winnersProcessed++;
      }
    }

    console.log(
      `Scraping completed successfully: ${moviesProcessed} movies processed, ${winnersProcessed} winners`
    );
  } catch (error) {
    console.error("Error scraping Academy Awards:", error);
    throw error;
  }
}

function analyzeTableStructure(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<Element>,
  tableIndex: number
): TableColumns | undefined {
  const headerRow = $table.find("tr").first();
  const headerTexts = headerRow
    .find("th")
    .map((_: number, element: Element) =>
      $(element).text().trim().toLowerCase()
    )
    .get();

  console.log(`Table ${tableIndex} headers: ${headerTexts.join(" | ")}`);

  if (headerTexts.includes("nominations") && headerTexts.includes("wins")) {
    console.log(`Skipping table ${tableIndex} (appears to be statistics)`);
    return undefined;
  }

  let filmIndex = -1;
  let yearIndex = -1;
  let producerIndex = -1;

  headerRow.find("th").each((index: number, element: Element) => {
    const headerText = $(element).text().trim().toLowerCase();

    if (
      (headerText.includes("film") || headerText.includes("picture")) &&
      !headerText.includes("studio")
    ) {
      filmIndex = index;
    } else if (
      headerText.includes("year") ||
      headerText.includes("release") ||
      /^\d{4}(-\d{2})?$/.test(headerText)
    ) {
      yearIndex = index;
    } else if (
      headerText.includes("studio") ||
      headerText.includes("producer")
    ) {
      producerIndex = index;
    }
  });

  if (filmIndex === -1) {
    console.log(`Skipping table ${tableIndex} (no film column found)`);
    return undefined;
  }

  if (yearIndex === -1) {
    yearIndex = 0;
  }

  let tableType: "film" | "producer" | "unknown" = "film";
  if (headerTexts.some((text) => text.includes("producer"))) {
    tableType = "producer";
  }

  console.log(
    `Table ${tableIndex}: film=${filmIndex}, year=${yearIndex}, producer=${producerIndex}, type=${tableType}`
  );

  return { filmIndex, yearIndex, producerIndex, tableType };
}

function processTableRows(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<Element>
): MovieInfo[] {
  const rows = $table.find("tr");
  const result: MovieInfo[] = [];
  let currentYear: number | undefined;
  const processedTitles = new Set<string>();

  console.log(`Processing table with ${rows.length} rows`);

  // 1行目はヘッダーなのでスキップ
  for (let index = 1; index < rows.length; index++) {
    const $row = $(rows[index]);
    const cells = $row.find("td");
    const headers = $row.find("th");

    console.log(`\nProcessing row ${index}:`);
    console.log(`Headers: ${headers.length}, Cells: ${cells.length}`);

    if (cells.length === 0 && headers.length === 0) {
      console.log("Skipping empty row");
      continue;
    }

    const extractedYear = extractYear($, $row);
    if (extractedYear) {
      console.log(
        `Found new year: ${extractedYear} (previous: ${currentYear})`
      );
      currentYear = extractedYear;
      processedTitles.clear();
    } else {
      console.log(`Using current year: ${currentYear}`);
    }

    if (!currentYear) {
      console.log("No year available, skipping row");
      continue;
    }

    const { title, referenceUrl, imdbId } = extractMovieTitle($, $row);
    if (!title) {
      console.log("No title found, skipping row");
      continue;
    }

    const dedupeKey = `${currentYear}-${title}`;

    if (processedTitles.has(dedupeKey)) {
      console.log(`Skipping duplicate: ${title} (${currentYear})`);
    } else {
      processedTitles.add(dedupeKey);
      const isWinner = determineIfWinner($, $row);

      console.log(
        `Adding movie: ${title} (${currentYear}) - ${
          isWinner ? "Winner" : "Nominee"
        } ${imdbId ? `IMDb: ${imdbId}` : ""}`
      );

      result.push({
        title,
        year: currentYear,
        isWinner,
        referenceUrl,
        imdbId,
      });
    }
  }

  console.log(`\nProcessed ${result.length} movies from table`);
  return result;
}

function extractYear(
  $: cheerio.CheerioAPI,
  $row: cheerio.Cheerio<Element>
): number | undefined {
  const rowHeader = $row.find("th").first();
  if (rowHeader.length > 0) {
    const yearText = rowHeader.text().trim();
    console.log("Found year header:", yearText);

    const yearRangeMatch = yearText.match(/(\d{4})[/-](\d{2})/);
    if (yearRangeMatch) {
      const startYear = Number.parseInt(yearRangeMatch[1]);
      const endYear = Number.parseInt(yearRangeMatch[2]);
      const fullEndYear = startYear - (startYear % 100) + endYear;
      console.log(`Extracted year range: ${startYear}-${fullEndYear}`);
      return fullEndYear;
    }

    const singleYearMatch = yearText.match(/(\d{4})/);
    if (singleYearMatch) {
      const year = Number.parseInt(singleYearMatch[1]);
      console.log(`Extracted single year: ${year}`);
      return year;
    }
  }

  return undefined;
}

function determineIfWinner(
  $: cheerio.CheerioAPI,
  $row: cheerio.Cheerio<Element>
): boolean {
  const filmCell = $row.find("td").first();

  if (filmCell.find("b").length > 0) {
    return true;
  }

  if (filmCell.attr("style")?.includes("background:#FAEB86")) {
    return true;
  }

  if (filmCell.attr("bgcolor") === "#FAEB86") {
    return true;
  }

  if (filmCell.css("background-color")?.includes("#FAEB86")) {
    return true;
  }

  if (filmCell.text().includes("*")) {
    return true;
  }

  return false;
}

function extractMovieTitle(
  $: cheerio.CheerioAPI,
  $row: cheerio.Cheerio<Element>
): { title: string; referenceUrl?: string; imdbId?: string } {
  const filmCell = $row.find("td").first();
  if (!filmCell || filmCell.length === 0) return { title: "" };

  let title = "";
  let referenceUrl: string | undefined;
  let imdbId: string | undefined;

  const italicElements = filmCell.find("i");
  const linkElement = filmCell.find("a").first();

  // IMDBリンクを探す
  filmCell.find("a").each((_: number, element: Element) => {
    const href = $(element).attr("href");
    if (href && href.includes("imdb.com")) {
      imdbId = href.match(/\/title\/(tt\d+)/)?.[1];
    }
  });

  if (linkElement.length > 0) {
    const href = linkElement.attr("href");
    if (href) {
      referenceUrl = `${WIKIPEDIA_BASE_URL}${href}`;
    }
  }

  title =
    italicElements.length > 0
      ? italicElements.first().text().trim()
      : filmCell.text().trim();

  if (linkElement.length > 0) {
    const linkText = linkElement.first().text().trim();
    if (linkText.length > 0 && linkText.length < title.length) {
      title = linkText;
    }
  }

  return { title: cleanupTitle(title), referenceUrl, imdbId };
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
    release_date: string;
  }[];
}

interface TMDatabaseMovieDetails {
  imdb_id: string;
  title: string;
  release_date: string;
}

// TMDb APIを使って映画を検索
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

// TMDb APIから映画の詳細情報を取得
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

// IMDb IDを取得する関数
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
  title: string,
  year: number,
  isWinner: boolean,
  referenceUrl?: string
) {
  try {
    const master = await fetchMasterData();
    const database = getDatabase(environment_);

    // IMDb IDを取得
    const imdbId = await fetchImdbId(title, year);

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
      .where(eq(translations.content, title));

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
        console.log(`Updated IMDb ID for ${title}: ${imdbId}`);
      }
    } else {
      // 新規映画の作成
      const [newMovie] = await database
        .insert(movies)
        .values({
          originalLanguage: "en",
          year,
          imdbId: imdbId || undefined,
        })
        .returning();

      if (!newMovie) {
        throw new Error(`Failed to create movie: ${title}`);
      }
      movieUid = newMovie.uid;

      await database.insert(translations).values({
        resourceType: "movie_title",
        resourceUid: movieUid,
        languageCode: "en",
        content: title,
        isDefault: 1,
      });
    }

    // 参照URLの更新または追加
    if (referenceUrl) {
      await database
        .insert(referenceUrls)
        .values({
          movieUid,
          url: referenceUrl,
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
            url: referenceUrl,
            updatedAt: Math.floor(Date.now() / 1000),
          },
        });
    }

    const ceremonyUid = await getOrCreateCeremony(year, master.organizationUid);

    // ノミネーション情報の更新または追加
    await database
      .insert(nominations)
      .values({
        movieUid: movieUid,
        ceremonyUid,
        categoryUid: master.categoryUid,
        isWinner: isWinner ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: [
          nominations.movieUid,
          nominations.ceremonyUid,
          nominations.categoryUid,
        ],
        set: {
          isWinner: isWinner ? 1 : 0,
          updatedAt: Math.floor(Date.now() / 1000),
        },
      });

    console.log(
      `Processed ${existingMovies.length > 0 ? "updated" : "new"} movie: ${title} (${year}) - ${
        isWinner ? "Winner" : "Nominee"
      } ${imdbId ? `IMDb: ${imdbId}` : ""}`
    );
  } catch (error) {
    console.error(`Error processing movie ${title}:`, error);
    throw error;
  }
}
