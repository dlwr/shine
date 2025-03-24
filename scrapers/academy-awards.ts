import * as cheerio from "cheerio";
import { awardCategories } from "db/schema/award-categories";
import { awardCeremonies } from "db/schema/award-ceremonies";
import { awardOrganizations } from "db/schema/award-organizations";
import { movies } from "db/schema/movies";
import { nominations } from "db/schema/nominations";
import { referenceUrls } from "db/schema/reference-urls";
import { translations } from "db/schema/translations";
import { Element } from "domhandler";
import { and, eq } from "drizzle-orm";
import { database, type NewNomination } from "../db";

const WIKIPEDIA_BASE_URL = "https://en.wikipedia.org";
const ACADEMY_AWARDS_URL = `${WIKIPEDIA_BASE_URL}/wiki/Academy_Award_for_Best_Picture`;

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
}

interface MasterData {
  organizationUid: string;
  categoryUid: string;
  ceremonies: Map<number, string>;
}

let masterData: MasterData | undefined;

async function fetchMasterData(): Promise<MasterData> {
  if (masterData) return masterData;

  const [organization] = await database
    .select()
    .from(awardOrganizations)
    .where(eq(awardOrganizations.name, "Academy Awards"));

  if (!organization) {
    throw new Error("Academy Awards organization not found");
  }

  const [category] = await database
    .select()
    .from(awardCategories)
    .where(eq(awardCategories.shortName, "Best Picture"));

  if (!category) {
    throw new Error("Best Picture category not found");
  }

  const ceremoniesData = await database
    .select()
    .from(awardCeremonies)
    .where(eq(awardCeremonies.organizationUid, organization.uid));

  const ceremonies = new Map(
    ceremoniesData.map((ceremony) => [ceremony.year, ceremony.uid])
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
        updatedAt: new Date(),
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

    // 空の行をスキップ
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

    const { title, referenceUrl } = extractMovieTitle($, $row);
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
        }`
      );
      result.push({ title, year: currentYear, isWinner, referenceUrl });
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
): { title: string; referenceUrl?: string } {
  const filmCell = $row.find("td").first();
  if (!filmCell || filmCell.length === 0) return { title: "" };

  let title = "";
  let referenceUrl: string | undefined;

  const italicElements = filmCell.find("i");
  const linkElement = filmCell.find("a").first();

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

  return { title: cleanupTitle(title), referenceUrl };
}

function cleanupTitle(title: string): string {
  return title
    .replaceAll(/\s*\([^)]*\)/g, "")
    .replaceAll(/\s*\[[^\]]*\]/g, "")
    .replaceAll("*", "")
    .trim();
}

async function processMovie(
  title: string,
  year: number,
  isWinner: boolean,
  referenceUrl?: string
) {
  try {
    const master = await fetchMasterData();

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
          eq(translations.languageCode, movies.originalLanguage),
          eq(translations.isDefault, true)
        )
      )
      .where(eq(translations.content, title));

    let movieUid: string;
    if (existingMovies.length > 0) {
      movieUid = existingMovies[0].movies.uid;
      console.log(`Found existing movie: ${title} (${year})`);
    } else {
      const [newMovie] = await database
        .insert(movies)
        .values({
          originalLanguage: "en",
          year,
        })
        .returning();

      if (!newMovie) {
        throw new Error(`Failed to create movie: ${title}`);
      }

      movieUid = newMovie.uid;

      await database
        .insert(translations)
        .values({
          resourceType: "movie_title",
          resourceUid: movieUid,
          languageCode: "en",
          content: title,
          isDefault: true,
        })
        .onConflictDoUpdate({
          target: [
            translations.resourceType,
            translations.resourceUid,
            translations.languageCode,
          ],
          set: {
            content: title,
            updatedAt: new Date(),
          },
        });
    }

    if (referenceUrl) {
      await database
        .insert(referenceUrls)
        .values({
          movieUid,
          url: referenceUrl,
          sourceType: "wikipedia",
          languageCode: "en",
          isPrimary: true,
        })
        .onConflictDoUpdate({
          target: [
            referenceUrls.movieUid,
            referenceUrls.sourceType,
            referenceUrls.languageCode,
          ],
          set: {
            url: referenceUrl,
            updatedAt: new Date(),
          },
        });
    }

    const ceremonyUid = await getOrCreateCeremony(year, master.organizationUid);

    const [existingNomination] = await database
      .select()
      .from(nominations)
      .where(
        and(
          eq(nominations.movieUid, movieUid),
          eq(nominations.ceremonyUid, ceremonyUid),
          eq(nominations.categoryUid, master.categoryUid)
        )
      );

    if (existingNomination) {
      console.log(`Skipping duplicate nomination: ${title} (${year})`);
      return;
    }

    const newNomination: NewNomination = {
      movieUid: movieUid,
      ceremonyUid,
      categoryUid: master.categoryUid,
      isWinner,
    };

    await database.insert(nominations).values(newNomination);
    console.log(
      `Processed nomination: ${title} (${year}) - ${
        isWinner ? "Winner" : "Nominee"
      }`
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Duplicate movie title")
    ) {
      console.log(`Skipping duplicate movie: ${title} (${year})`);
      return;
    }
    console.error(`Error processing movie ${title}:`, error);
  }
}
