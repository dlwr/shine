import * as cheerio from 'cheerio';
import {type Element} from 'domhandler';
import {and, eq, isNull} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import {
  fetchTMDBConfig,
  fetchTMDBMovieDetails,
  searchTMDBMovie,
  type TMDBConfig,
} from './common/tmdb-utilities';
import {FetchHttpError, fetchWithRetry} from './common/fetch-utilities';
import {getScrapeDatabase} from './common/dry-run';

const WIKIPEDIA_BASE_URL = 'https://en.wikipedia.org';

type MovieInfo = {
  title: string;
  year: number;
  isWinner: boolean;
  referenceUrl?: string;
  director?: string;
  country?: string;
};

type MainData = {
  organizationUid: string;
  palmeDOrCategoryUid: string;
  grandPrixCategoryUid: string;
  ceremonies: Map<number, string>;
};

type ScrapeContext = {
  environment: Environment;
  tmdbApiKey: string | undefined;
  isDryRun: boolean;
};

export default {
  async fetch(request: Request, environment: Environment): Promise<Response> {
    const tmdbApiKey = environment.TMDB_API_KEY;

    const url = new URL(request.url);
    const yearParameter = url.searchParams.get('year');
    const winnersOnlyParameter = url.searchParams.get('winners-only');
    const dryRunParameter = url.searchParams.get('dry-run');
    const context: ScrapeContext = {
      environment,
      tmdbApiKey,
      isDryRun: dryRunParameter === 'true',
    };

    try {
      if (context.isDryRun) {
        console.log(
          '[DRY RUN MODE] No actual database operations will be performed',
        );
      }

      if (winnersOnlyParameter === 'true') {
        // 受賞作品のみ更新
        if (yearParameter) {
          const targetYear = Number(yearParameter);
          await updateCannesWinnersOnly(context, targetYear);
        } else {
          await updateAllCannesWinnersOnly(context);
        }
      } else if (yearParameter) {
        // 通常のスクレイピング
        const targetYear = Number(yearParameter);
        await scrapeCannesFilmFestivalYear(context, targetYear);
      } else {
        await scrapeCannesFilmFestival(context);
      }

      return new Response('Scraping completed successfully', {status: 200});
    } catch (error) {
      return new Response(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        {status: 500},
      );
    }
  },
};

async function seedCannesOrganization(context: ScrapeContext): Promise<void> {
  const database = getScrapeDatabase(context);

  // カンヌ映画祭の組織を作成
  await database
    .insert(awardOrganizations)
    .values({
      name: 'Cannes Film Festival',
      country: 'France',
      establishedYear: 1946,
    })
    .onConflictDoNothing();

  const [organization] = await database
    .select()
    .from(awardOrganizations)
    .where(eq(awardOrganizations.name, 'Cannes Film Festival'));

  if (!organization) {
    throw new Error('Failed to create Cannes Film Festival organization');
  }

  // Palme d'Or カテゴリーを作成
  await database
    .insert(awardCategories)
    .values({
      organizationUid: organization.uid,
      name: "Palme d'Or",
      shortName: "Palme d'Or",
    })
    .onConflictDoNothing();

  // Grand Prix カテゴリーを作成
  await database
    .insert(awardCategories)
    .values({
      organizationUid: organization.uid,
      name: 'Grand Prix',
      shortName: 'Grand Prix',
    })
    .onConflictDoNothing();
}

const fetchMainData = (() => {
  let mainData: MainData | undefined;

  return async function fetchMainData(
    context: ScrapeContext,
  ): Promise<MainData> {
    if (mainData) {
      return mainData;
    }

    if (context.isDryRun) {
      // Dry run mode - return mock data
      mainData = {
        organizationUid: 'mock-cannes-uid',
        palmeDOrCategoryUid: 'mock-palme-dor-uid',
        grandPrixCategoryUid: 'mock-grand-prix-uid',
        ceremonies: new Map(),
      };
      return mainData;
    }

    // 組織が存在しない場合は作成
    await seedCannesOrganization(context);

    const [organization] = await getScrapeDatabase(context)
      .select()
      .from(awardOrganizations)
      .where(eq(awardOrganizations.name, 'Cannes Film Festival'));

    if (!organization) {
      throw new Error('Cannes Film Festival organization not found');
    }

    const categories = await getScrapeDatabase(context)
      .select()
      .from(awardCategories)
      .where(eq(awardCategories.organizationUid, organization.uid));

    const palmeDOr = categories.find(cat => cat.shortName === "Palme d'Or");
    const grandPrix = categories.find(cat => cat.shortName === 'Grand Prix');

    if (!palmeDOr || !grandPrix) {
      throw new Error('Required categories not found');
    }

    const ceremoniesData = await getScrapeDatabase(context)
      .select()
      .from(awardCeremonies)
      .where(eq(awardCeremonies.organizationUid, organization.uid));

    const ceremonies = new Map<number, string>(
      ceremoniesData.map(ceremony => [ceremony.year, ceremony.uid]),
    );

    mainData = {
      organizationUid: organization.uid,
      palmeDOrCategoryUid: palmeDOr.uid,
      grandPrixCategoryUid: grandPrix.uid,
      ceremonies,
    };

    return mainData;
  };
})();

// 1946年開始、1948年と1950年は未開催（2020年は中止だが第73回として数える）
export function cannesCeremonyNumber(year: number): number | undefined {
  if (year === 1946 || year === 1947) {
    return year - 1945;
  }

  if (year === 1949) {
    return 3;
  }

  if (year >= 1951) {
    return year - 1947;
  }

  return undefined;
}

async function getOrCreateCeremony(
  context: ScrapeContext,
  year: number,
  organizationUid: string,
): Promise<string> {
  if (context.isDryRun) {
    const ceremonyUid = `dry-run-ceremony-${year}`;
    const dryRunMain = await fetchMainData(context);
    dryRunMain.ceremonies.set(year, ceremonyUid);
    return ceremonyUid;
  }

  const database = getScrapeDatabase(context);
  const [ceremony] = await database
    .insert(awardCeremonies)
    .values({
      organizationUid,
      year,
      ceremonyNumber: cannesCeremonyNumber(year),
    })
    .onConflictDoUpdate({
      target: [awardCeremonies.organizationUid, awardCeremonies.year],
      set: {
        ceremonyNumber: cannesCeremonyNumber(year),
      },
    })
    .returning();

  const main = await fetchMainData(context);
  main.ceremonies.set(year, ceremony.uid);

  return ceremony.uid;
}

type YearBatchData = {
  translations: Array<typeof translations.$inferInsert>;
  posterUrls: Array<typeof posterUrls.$inferInsert>;
  referenceUrls: Array<typeof referenceUrls.$inferInsert>;
  nominations: Array<typeof nominations.$inferInsert>;
  movieCount: number;
};

async function processCannesYear(
  context: ScrapeContext,
  year: number,
  main: MainData,
) {
  console.log(`\nProcessing Cannes ${year}...`);

  try {
    const batches = await gatherYearBatches(context, year, main);
    await persistYearBatches(context, year, batches);
    console.log(`Processed ${batches.movieCount} movies for ${year}`);
  } catch (error) {
    console.error(`Error processing year ${year}:`, error);
  }

  await delay(1000);
}

async function gatherYearBatches(
  context: ScrapeContext,
  year: number,
  main: MainData,
): Promise<YearBatchData> {
  const movies = await scrapeYearPage(year);
  const ceremonyUid = await getOrCreateCeremony(
    context,
    year,
    main.organizationUid,
  );
  const batches: YearBatchData = {
    translations: [],
    posterUrls: [],
    referenceUrls: [],
    nominations: [],
    movieCount: movies.length,
  };

  for (const movie of movies) {
    const batchData = await processMovieForBatch(
      context,
      movie,
      ceremonyUid,
      main,
    );
    if (!batchData) {
      continue;
    }

    batches.translations.push(...batchData.translations);
    batches.posterUrls.push(...batchData.posterUrls);

    if (batchData.referenceUrl) {
      batches.referenceUrls.push(batchData.referenceUrl);
    }

    if (batchData.nomination) {
      batches.nominations.push(batchData.nomination);
    }
  }

  return batches;
}

async function persistYearBatches(
  context: ScrapeContext,
  year: number,
  batches: YearBatchData,
) {
  if (context.isDryRun) {
    console.log(`\n[DRY RUN] Would insert for ${year}:`);
    console.log(`  - ${batches.translations.length} translations`);
    console.log(`  - ${batches.posterUrls.length} poster URLs`);
    console.log(`  - ${batches.referenceUrls.length} reference URLs`);
    console.log(`  - ${batches.nominations.length} nominations`);
    return;
  }

  const database = getScrapeDatabase(context);

  if (batches.translations.length > 0) {
    console.log(
      `Inserting ${batches.translations.length} translations in batch...`,
    );
    await database
      .insert(translations)
      .values(batches.translations)
      .onConflictDoNothing();
  }

  if (batches.posterUrls.length > 0) {
    console.log(
      `Inserting ${batches.posterUrls.length} poster URLs in batch...`,
    );
    await database
      .insert(posterUrls)
      .values(batches.posterUrls)
      .onConflictDoNothing();
  }

  if (batches.referenceUrls.length > 0) {
    console.log(
      `Inserting ${batches.referenceUrls.length} reference URLs in batch...`,
    );
    await database
      .insert(referenceUrls)
      .values(batches.referenceUrls)
      .onConflictDoNothing();
  }

  if (batches.nominations.length > 0) {
    console.log(
      `Inserting ${batches.nominations.length} nominations in batch...`,
    );
    await database
      .insert(nominations)
      .values(batches.nominations)
      .onConflictDoNothing();
  }
}

async function delay(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });
}

export async function scrapeCannesFilmFestival(context: ScrapeContext) {
  try {
    const main = await fetchMainData(context);
    const currentYear = new Date().getFullYear();

    for (let year = currentYear; year >= 1946; year--) {
      await processCannesYear(context, year, main);
    }

    console.log('Cannes Film Festival scraping completed successfully');
  } catch (error) {
    console.error('Error scraping Cannes Film Festival:', error);
    throw error;
  }
}

export async function scrapeCannesFilmFestivalYear(
  context: ScrapeContext,
  year: number,
) {
  try {
    const main = await fetchMainData(context);

    console.log(`Processing Cannes ${year}...`);

    const movies = await scrapeYearPage(year);
    const ceremonyUid = await getOrCreateCeremony(
      context,
      year,
      main.organizationUid,
    );

    // バッチ処理のためのデータを収集
    const translationsBatch: Array<typeof translations.$inferInsert> = [];
    const posterUrlsBatch: Array<typeof posterUrls.$inferInsert> = [];
    const referenceUrlsBatch: Array<typeof referenceUrls.$inferInsert> = [];
    const nominationsBatch: Array<typeof nominations.$inferInsert> = [];

    for (const movie of movies) {
      const batchData = await processMovieForBatch(
        context,
        movie,
        ceremonyUid,
        main,
      );
      if (batchData) {
        translationsBatch.push(...batchData.translations);
        posterUrlsBatch.push(...batchData.posterUrls);
        if (batchData.referenceUrl) {
          referenceUrlsBatch.push(batchData.referenceUrl);
        }

        if (batchData.nomination) {
          nominationsBatch.push(batchData.nomination);
        }
      }
    }

    // バッチでデータを挿入
    if (context.isDryRun) {
      console.log(`\n[DRY RUN] Would insert for year ${year}:`);
      console.log(`  - ${translationsBatch.length} translations`);
      console.log(`  - ${posterUrlsBatch.length} poster URLs`);
      console.log(`  - ${referenceUrlsBatch.length} reference URLs`);
      console.log(`  - ${nominationsBatch.length} nominations`);
    } else {
      const database = getScrapeDatabase(context);

      if (translationsBatch.length > 0) {
        console.log(
          `Inserting ${translationsBatch.length} translations in batch...`,
        );
        await database
          .insert(translations)
          .values(translationsBatch)
          .onConflictDoNothing();
      }

      if (posterUrlsBatch.length > 0) {
        console.log(
          `Inserting ${posterUrlsBatch.length} poster URLs in batch...`,
        );
        await database
          .insert(posterUrls)
          .values(posterUrlsBatch)
          .onConflictDoNothing();
      }

      if (referenceUrlsBatch.length > 0) {
        console.log(
          `Inserting ${referenceUrlsBatch.length} reference URLs in batch...`,
        );
        await database
          .insert(referenceUrls)
          .values(referenceUrlsBatch)
          .onConflictDoNothing();
      }

      if (nominationsBatch.length > 0) {
        console.log(
          `Inserting ${nominationsBatch.length} nominations in batch...`,
        );
        await database
          .insert(nominations)
          .values(nominationsBatch)
          .onConflictDoNothing();
      }
    }

    console.log(`Processed ${movies.length} movies for ${year}`);
    console.log(`Cannes ${year} scraping completed successfully`);
  } catch (error) {
    console.error(`Error scraping Cannes ${year}:`, error);
    throw error;
  }
}

async function scrapeYearPage(year: number): Promise<MovieInfo[]> {
  // まず年ごとのカンヌ映画祭のページを取得
  const yearUrl = `${WIKIPEDIA_BASE_URL}/wiki/${year}_Cannes_Film_Festival`;

  console.log(`Fetching ${yearUrl}...`);
  let html: string;
  try {
    html = await fetchWithRetry(yearUrl);
  } catch (error) {
    if (error instanceof FetchHttpError && error.status === 404) {
      console.log(`Page not found for ${year}, skipping...`);
      return [];
    }

    throw error;
  }

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
  const palmeDOrWinner = findPalmeDOrWinner($, year);
  if (palmeDOrWinner) {
    // 既存のリストから該当する映画を見つけて更新
    const existingMovie = movies.find(m => m.title === palmeDOrWinner.title);
    if (existingMovie) {
      existingMovie.isWinner = true;
    } else {
      movies.push(palmeDOrWinner);
    }
  }

  return movies;
}

type FilmTableMatch = {
  table: cheerio.Cheerio<Element>;
  source: 'self' | 'child';
};

function extractHeaderTexts(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<Element>,
): string[] {
  return table
    .find('tr')
    .first()
    .find('th')
    .map((_, element) => $(element).text().toLowerCase())
    .get();
}

function hasFilmHeaders(headerTexts: string[]): boolean {
  return headerTexts.some(
    header =>
      header.includes('title') ||
      header.includes('film') ||
      header.includes('director'),
  );
}

function hasPersonHeaders(headerTexts: string[]): boolean {
  return headerTexts.some(
    header =>
      header.includes('jury') ||
      header.includes('member') ||
      header.includes('president'),
  );
}

function locateFilmTable(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<Element>,
): FilmTableMatch | undefined {
  if (element.is('table')) {
    const headers = extractHeaderTexts($, element);
    if (hasFilmHeaders(headers) && !hasPersonHeaders(headers)) {
      return {table: element, source: 'self'};
    }
  }

  const childTable = element.find('table').first();
  if (childTable.length > 0) {
    const headers = extractHeaderTexts($, childTable);
    if (hasFilmHeaders(headers) && !hasPersonHeaders(headers)) {
      return {table: childTable, source: 'child'};
    }
  }

  return undefined;
}

function isPotentialFilmsHeading(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('film') || lower.includes('official selection');
}

function findCompetitionSection(
  $: cheerio.CheerioAPI,
): cheerio.Cheerio<Element> | undefined {
  const tables = $('table.wikitable');
  console.log(`Found ${tables.length} wikitable(s)`);

  for (const [index, tableElement] of tables.toArray().entries()) {
    const table = $(tableElement);
    const headerTexts = extractHeaderTexts($, table);

    console.log(`Table ${index} headers: ${headerTexts.join(' | ')}`);

    if (hasFilmHeaders(headerTexts) && !hasPersonHeaders(headerTexts)) {
      console.log(`Found films table at index ${index}`);
      return table;
    }
  }

  const headings = $('h2, h3, h4');

  for (const heading of headings) {
    const $heading = $(heading);
    const text = $heading.text();

    if (!isPotentialFilmsHeading(text)) {
      continue;
    }

    console.log(`Found potential films heading: "${text}"`);

    const table = findTableAfterHeading($, $heading);
    if (table) {
      return table;
    }
  }

  console.log('No films table found');
  return undefined;
}

function extractMoviesFromSection(
  _$: cheerio.CheerioAPI,
  section: cheerio.Cheerio<Element>,
  year: number,
): MovieInfo[] {
  const movies: MovieInfo[] = [];

  if (section.is('ul, ol')) {
    // リスト形式の場合
    section.find('li').each((_, element) => {
      const movieInfo = parseMovieListItem(_$, _$(element), year);
      if (movieInfo) {
        movies.push(movieInfo);
      }
    });
  } else if (section.is('table')) {
    // テーブル形式の場合
    section.find('tr').each((index, element) => {
      if (index === 0) {
        return;
      } // ヘッダー行をスキップ

      const movieInfo = parseMovieTableRow(_$, _$(element), year);
      if (movieInfo) {
        movies.push(movieInfo);
      }
    });
  }

  return movies;
}

function parseMovieListItem(
  _$: cheerio.CheerioAPI,
  $item: cheerio.Cheerio<Element>,
  year: number,
): MovieInfo | undefined {
  const text = $item.text();

  // イタリック体のタイトルを探す
  const titleElement = $item.find('i').first();
  const linkElement = $item.find('a').first();

  let title = '';
  let referenceUrl: string | undefined;

  if (titleElement.length > 0) {
    title = titleElement.text().trim();
  } else if (linkElement.length > 0) {
    title = linkElement.text().trim();
    const href = linkElement.attr('href');
    if (href) {
      referenceUrl = `${WIKIPEDIA_BASE_URL}${href}`;
    }
  } else {
    // タイトルをテキストから抽出
    const match = /^([^–—-]+)/.exec(text);
    if (match) {
      title = match[1].trim();
    }
  }

  if (!title) {
    return undefined;
  }

  // 監督を抽出
  let director: string | undefined;
  const directorMatch = /(?:directed by|by|–|—)\s*([^,\n]+)/i.exec(text);
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
  _$: cheerio.CheerioAPI,
  $row: cheerio.Cheerio<Element>,
  year: number,
): MovieInfo | undefined {
  const cells = $row.find('td');
  if (cells.length < 2) {
    return undefined;
  }

  // 通常、最初のセルがタイトル、2番目が監督
  const titleCell = cells.eq(0);
  const directorCell = cells.eq(1);

  const titleElement = titleCell.find('i').first();
  const linkElement = titleCell.find('a').first();

  let referenceUrl: string | undefined;

  let title: string;
  if (titleElement.length > 0) {
    title = titleElement.text().trim();
  } else if (linkElement.length > 0) {
    title = linkElement.text().trim();
    const href = linkElement.attr('href');
    if (href) {
      referenceUrl = `${WIKIPEDIA_BASE_URL}${href}`;
    }
  } else {
    title = titleCell.text().trim();
  }

  if (!title) {
    return undefined;
  }

  const director = directorCell.text().trim() || undefined;

  return {
    title: cleanupTitle(title),
    year,
    isWinner: false,
    referenceUrl,
    director,
  };
}

type WinnerCandidate = {
  title: string;
  referenceUrl?: string;
};

const PALME_KEYWORDS = ["palme d'or", "palm d'or", 'golden palm'];

function containsPalmeKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return PALME_KEYWORDS.some(keyword => lower.includes(keyword));
}

const TITLE_PATTERNS = [
  /palme d'or[:\s-]+([^,\n(]+)/i,
  /palm d'or[:\s-]+([^,\n(]+)/i,
  /golden palm[:\s-]+([^,\n(]+)/i,
];

function extractWinnerFromText(text: string): string | undefined {
  for (const pattern of TITLE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return undefined;
}

function extractWinnerFromElement(
  $: cheerio.CheerioAPI,
  scope: cheerio.Cheerio<Element>,
): WinnerCandidate | undefined {
  const italicElement = scope.find('i').first();
  if (italicElement.length > 0) {
    const title = italicElement.text().trim();
    if (title) {
      return {title};
    }
  }

  const linkElement = scope.find('a').first();
  if (linkElement.length > 0) {
    const linkText = linkElement.text().trim();
    if (linkText && !containsPalmeKeyword(linkText)) {
      const href = linkElement.attr('href');
      return {
        title: linkText,
        referenceUrl: href ? `${WIKIPEDIA_BASE_URL}${href}` : undefined,
      };
    }
  }

  const fullText = scope.text().trim();
  const extractedTitle = extractWinnerFromText(fullText);
  if (extractedTitle) {
    return {title: extractedTitle};
  }

  return undefined;
}

function buildWinner(candidate: WinnerCandidate, year: number): MovieInfo {
  return {
    title: cleanupTitle(candidate.title),
    year,
    isWinner: true,
    referenceUrl: candidate.referenceUrl,
  };
}

function findWinnerInInfobox(
  $: cheerio.CheerioAPI,
): WinnerCandidate | undefined {
  const infoBox = $('.infobox');
  if (infoBox.length === 0) {
    return undefined;
  }

  for (const row of infoBox.find('tr')) {
    const $row = $(row);
    const header = $row.find('th').text();
    if (!containsPalmeKeyword(header)) {
      continue;
    }

    const valueCell = $row.find('td').first();
    if (valueCell.length === 0) {
      continue;
    }

    const candidate = extractWinnerFromElement($, valueCell);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function findWinnerInAwardsSections(
  $: cheerio.CheerioAPI,
): WinnerCandidate | undefined {
  const headings = $('h2, h3, h4');

  for (const heading of headings) {
    const $heading = $(heading);
    const text = $heading.text().toLowerCase();
    if (!text.includes('award') && !text.includes('prize')) {
      continue;
    }

    const candidate = searchAwardSection($, $heading);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function searchAwardSection(
  $: cheerio.CheerioAPI,
  heading: cheerio.Cheerio<Element>,
): WinnerCandidate | undefined {
  let nextElement = heading.parent().next();
  let attempts = 0;

  while (nextElement.length > 0 && attempts < 10) {
    const listWinner = findWinnerInLists($, nextElement);
    if (listWinner) {
      return listWinner;
    }

    const tableWinner = findWinnerInTables($, nextElement);
    if (tableWinner) {
      return tableWinner;
    }

    if (nextElement.is('h2, h3, h4')) {
      break;
    }

    nextElement = nextElement.next();
    attempts++;
  }

  return undefined;
}

function findWinnerInLists(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<Element>,
): WinnerCandidate | undefined {
  const listItems = container.find('li');

  for (const item of listItems) {
    const $item = $(item);
    if (!containsPalmeKeyword($item.text())) {
      continue;
    }

    const candidate = extractWinnerFromElement($, $item);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function findWinnerInTables(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<Element>,
): WinnerCandidate | undefined {
  const tables = container.find('table');

  for (const table of tables) {
    const $table = $(table);
    const candidate = findPalmeWinnerInTable($, $table);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function extractWinnerFromAwardRow(
  $: cheerio.CheerioAPI,
  row: cheerio.Cheerio<Element>,
): WinnerCandidate | undefined {
  const cells = row.find('td');
  if (cells.length === 0) {
    return undefined;
  }

  const titleCell = cells.length > 1 ? cells.eq(1) : cells.first();
  return extractWinnerFromElement($, titleCell);
}

function findTableAfterHeading(
  $: cheerio.CheerioAPI,
  $heading: cheerio.Cheerio<Element>,
): cheerio.Cheerio<Element> | undefined {
  let nextElement = $heading.parent().next();
  let attempts = 0;

  while (nextElement.length > 0 && attempts < 15) {
    const filmTableMatch = locateFilmTable($, nextElement);
    if (filmTableMatch) {
      const message =
        filmTableMatch.source === 'self'
          ? 'Found films table after heading'
          : 'Found films table inside element';
      console.log(message);
      return filmTableMatch.table;
    }

    if (nextElement.is('h2, h3, h4')) {
      console.log('Reached next heading, stopping search');
      return undefined;
    }

    nextElement = nextElement.next();
    attempts++;
  }

  return undefined;
}

function findPalmeWinnerInTable(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<Element>,
): WinnerCandidate | undefined {
  for (const row of $table.find('tr')) {
    const $row = $(row);
    if (!containsPalmeKeyword($row.text())) {
      continue;
    }

    const candidate = extractWinnerFromAwardRow($, $row);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function findPalmeDOrWinner(
  $: cheerio.CheerioAPI,
  year: number,
): MovieInfo | undefined {
  const infoboxWinner = findWinnerInInfobox($);
  if (infoboxWinner) {
    return buildWinner(infoboxWinner, year);
  }

  const sectionWinner = findWinnerInAwardsSections($);
  if (sectionWinner) {
    return buildWinner(sectionWinner, year);
  }

  return undefined;
}

export async function updateAllCannesWinnersOnly(context: ScrapeContext) {
  try {
    await fetchMainData(context);

    const currentYear = new Date().getFullYear();
    for (let year = currentYear; year >= 1946; year--) {
      console.log(`\nUpdating Cannes winners for ${year}...`);

      try {
        await updateCannesWinnersOnly(context, year);
      } catch (error) {
        console.error(`Error updating winners for year ${year}:`, error);
      }

      await new Promise(resolve => {
        setTimeout(resolve, 500);
      });
    }

    console.log('Cannes winners update completed successfully');
  } catch (error) {
    console.error('Error updating Cannes winners:', error);
    throw error;
  }
}

export async function updateCannesWinnersOnly(
  context: ScrapeContext,
  year: number,
) {
  try {
    const main = await fetchMainData(context);

    console.log(`Processing Cannes ${year} winners...`);

    const winner = await fetchPalmeDOrWinner(year);

    if (winner) {
      await updateWinnerStatus(
        context,
        winner,
        await getOrCreateCeremony(context, year, main.organizationUid),
        main,
      );
      console.log(`Updated winner for ${year}: ${winner.title}`);
    } else {
      console.log(`No Palme d'Or winner found for ${year}`);
    }

    console.log(`Cannes ${year} winner update completed`);
  } catch (error) {
    console.error(`Error updating Cannes ${year} winners:`, error);
    throw error;
  }
}

async function fetchPalmeDOrWinner(
  year: number,
): Promise<MovieInfo | undefined> {
  const yearUrl = `${WIKIPEDIA_BASE_URL}/wiki/${year}_Cannes_Film_Festival`;

  console.log(`Fetching ${yearUrl}...`);
  let html: string;
  try {
    html = await fetchWithRetry(yearUrl);
  } catch (error) {
    if (error instanceof FetchHttpError && error.status === 404) {
      console.log(`Page not found for ${year}, skipping...`);
      return undefined;
    }

    throw error;
  }

  const $ = cheerio.load(html);

  return findPalmeDOrWinner($, year);
}

async function updateWinnerStatus(
  context: ScrapeContext,
  movieInfo: MovieInfo,
  ceremonyUid: string,
  main: MainData,
) {
  try {
    if (context.isDryRun) {
      console.log(
        `[DRY RUN] Would mark winner: ${movieInfo.title} (${movieInfo.year})`,
      );
      return;
    }

    const database = getScrapeDatabase(context);

    // 既存の映画を検索
    const existingMovies = await database
      .select({
        movies,
        translations,
      })
      .from(movies)
      .innerJoin(
        translations,
        and(
          eq(translations.resourceUid, movies.uid),
          eq(translations.resourceType, 'movie_title'),
          eq(translations.languageCode, 'en'),
          eq(translations.isDefault, 1),
        ),
      )
      .where(
        and(
          eq(translations.content, movieInfo.title),
          isNull(movies.deletedAt),
        ),
      );

    if (existingMovies.length === 0) {
      console.log(`Movie not found in database: ${movieInfo.title}`);
      return;
    }

    const movieUid = existingMovies[0].movies.uid;

    // ノミネーション情報を更新
    await database
      .update(nominations)
      .set({
        isWinner: 1,
      })
      .where(
        and(
          eq(nominations.movieUid, movieUid),
          eq(nominations.ceremonyUid, ceremonyUid),
          eq(nominations.categoryUid, main.palmeDOrCategoryUid),
        ),
      );

    console.log(
      `Updated winner status for ${movieInfo.title} (${movieInfo.year})`,
    );
  } catch (error) {
    console.error(
      `Error updating winner status for ${movieInfo.title}:`,
      error,
    );
    throw error;
  }
}

function cleanupTitle(title: string): string {
  return title
    .replaceAll(/\s*\([^)]*\)/g, '')
    .replaceAll(/\s*\[[^\]]*]/g, '')
    .replaceAll('*', '')
    .trim();
}

type MovieDetailsResult = {
  imdbId?: string;
  posterPath?: string;
  japaneseTitle?: string;
  originalLanguage?: string;
};

async function fetchMovieDetails(
  context: ScrapeContext,
  title: string,
  year: number,
): Promise<MovieDetailsResult> {
  if (!context.tmdbApiKey) {
    console.error('TMDb API key is not set');
    return {};
  }

  try {
    // TMDbで映画を検索
    const movieId = await searchTMDBMovie(title, year, context.tmdbApiKey);
    if (!movieId) {
      console.log(`No TMDb match found for ${title} (${year})`);
      return {};
    }

    // 英語版・日本語版の詳細情報を取得
    const dataEn = await fetchTMDBMovieDetails(
      movieId,
      context.tmdbApiKey,
      'en-US',
    );
    const dataJa = await fetchTMDBMovieDetails(
      movieId,
      context.tmdbApiKey,
      'ja',
    );

    // 日本語タイトルが英語タイトルと異なる場合のみ保存
    const japaneseTitle =
      dataJa?.title && dataJa.title !== dataJa.original_title
        ? dataJa.title
        : undefined;

    const details: MovieDetailsResult = {
      imdbId: dataEn?.imdb_id || undefined,
      posterPath: dataEn?.poster_path || undefined,
      japaneseTitle,
      originalLanguage: dataEn?.original_language || undefined,
    };

    if (details.imdbId) {
      console.log(`Found IMDb ID for ${title} (${year}): ${details.imdbId}`);
    }

    if (details.japaneseTitle) {
      console.log(
        `Found Japanese title for ${title} (${year}): ${details.japaneseTitle}`,
      );
    }

    if (details.posterPath) {
      console.log(`Found poster for ${title} (${year}): ${details.posterPath}`);
    }

    return details;
  } catch (error) {
    console.error(
      `Error fetching movie details for ${title} (${year}):`,
      error,
    );
    return {};
  }
}

type DatabaseClient = ReturnType<typeof getDatabase>;

type MovieDetails = Awaited<ReturnType<typeof fetchMovieDetails>>;

async function resolveMovieUid(
  database: DatabaseClient,
  movieInfo: MovieInfo,
  movieDetails: MovieDetails,
): Promise<{
  movieUid: string;
  translations: Array<typeof translations.$inferInsert>;
  wasExisting: boolean;
}> {
  const existingMovies = await database
    .select({
      movies,
      translations,
    })
    .from(movies)
    .innerJoin(
      translations,
      and(
        eq(translations.resourceUid, movies.uid),
        eq(translations.resourceType, 'movie_title'),
        eq(translations.languageCode, 'en'),
        eq(translations.isDefault, 1),
      ),
    )
    .where(
      and(eq(translations.content, movieInfo.title), isNull(movies.deletedAt)),
    );

  if (existingMovies.length > 0) {
    const existingMovie = existingMovies[0].movies;
    if (movieDetails.imdbId && !existingMovie.imdbId) {
      await database
        .update(movies)
        .set({
          imdbId: movieDetails.imdbId,
        })
        .where(eq(movies.uid, existingMovie.uid));
      console.log(
        `Updated IMDb ID for ${movieInfo.title}: ${movieDetails.imdbId}`,
      );
    }

    return {
      movieUid: existingMovie.uid,
      translations: [],
      wasExisting: true,
    };
  }

  const [newMovie] = await database
    .insert(movies)
    .values({
      originalLanguage: movieDetails.originalLanguage ?? 'en',
      year: movieInfo.year,
      imdbId: movieDetails.imdbId || undefined,
    })
    .returning();

  if (!newMovie) {
    throw new Error(`Failed to create movie: ${movieInfo.title}`);
  }

  const translationsBatch: Array<typeof translations.$inferInsert> = [
    {
      resourceType: 'movie_title',
      resourceUid: newMovie.uid,
      languageCode: 'en',
      content: movieInfo.title,
      isDefault: 1,
    },
  ];

  return {
    movieUid: newMovie.uid,
    translations: translationsBatch,
    wasExisting: false,
  };
}

function appendJapaneseTitle(
  translationsBatch: Array<typeof translations.$inferInsert>,
  movieDetails: MovieDetails,
  movieUid: string,
) {
  if (!movieDetails.japaneseTitle) {
    return;
  }

  translationsBatch.push({
    resourceType: 'movie_title',
    resourceUid: movieUid,
    languageCode: 'ja',
    content: movieDetails.japaneseTitle,
    isDefault: 1,
  });
}

async function collectPosterUrls(
  context: ScrapeContext,
  movieDetails: MovieDetails,
  movieUid: string,
  sizes: string[] = ['w342'],
): Promise<Array<typeof posterUrls.$inferInsert>> {
  if (!context.tmdbApiKey || !movieDetails.posterPath) {
    return [];
  }

  let config: TMDBConfig;
  try {
    config = await fetchTMDBConfig(context.tmdbApiKey);
  } catch (error) {
    console.error('Error fetching TMDb config:', error);
    return [];
  }

  const results: Array<typeof posterUrls.$inferInsert> = [];

  for (const [index, size] of sizes.entries()) {
    if (!config.images.poster_sizes.includes(size)) {
      continue;
    }

    const posterUrl = `${config.images.secure_base_url}${size}${movieDetails.posterPath}`;
    const width = Number(size.slice(1));

    results.push({
      movieUid,
      url: posterUrl,
      width,
      sourceType: 'tmdb',
      isPrimary: index === 0 ? 1 : 0,
    });
  }

  return results;
}

function buildReferenceUrlData(
  movieInfo: MovieInfo,
  movieUid: string,
): typeof referenceUrls.$inferInsert | undefined {
  if (!movieInfo.referenceUrl) {
    return undefined;
  }

  return {
    movieUid,
    url: movieInfo.referenceUrl,
    sourceType: 'wikipedia',
    languageCode: 'en',
    isPrimary: 1,
  };
}

function buildNominationData(
  movieInfo: MovieInfo,
  movieUid: string,
  ceremonyUid: string,
  main: MainData,
): typeof nominations.$inferInsert {
  return {
    movieUid,
    ceremonyUid,
    categoryUid: main.palmeDOrCategoryUid,
    isWinner: movieInfo.isWinner ? 1 : 0,
  };
}

function logProcessedMovie(
  movieInfo: MovieInfo,
  movieDetails: MovieDetails,
  wasExisting: boolean,
) {
  const extras = [
    movieDetails.imdbId ? `IMDb: ${movieDetails.imdbId}` : '',
    movieDetails.japaneseTitle ? `JA: ${movieDetails.japaneseTitle}` : '',
    movieDetails.posterPath ? 'Poster: ✓' : '',
  ].filter(Boolean);
  const postfix = extras.length > 0 ? ` ${extras.join(' ')}` : '';

  console.log(
    `Processed ${wasExisting ? 'updated' : 'new'} movie: ${movieInfo.title} (${movieInfo.year}) - ${
      movieInfo.isWinner ? "Palme d'Or Winner" : 'In Competition'
    }${postfix}`,
  );
}

async function processMovieForBatch(
  context: ScrapeContext,
  movieInfo: MovieInfo,
  ceremonyUid: string,
  main: MainData,
): Promise<
  | {
      translations: Array<typeof translations.$inferInsert>;
      posterUrls: Array<typeof posterUrls.$inferInsert>;
      referenceUrl?: typeof referenceUrls.$inferInsert;
      nomination?: typeof nominations.$inferInsert;
    }
  | undefined
> {
  try {
    if (context.isDryRun) {
      console.log(
        `[DRY RUN] Would process movie: ${movieInfo.title} (${movieInfo.year}) - ${
          movieInfo.isWinner ? 'Winner' : 'Nominee'
        }`,
      );
      return undefined;
    }

    const database = getScrapeDatabase(context);
    const movieDetails = await fetchMovieDetails(
      context,
      movieInfo.title,
      movieInfo.year,
    );
    const movieResolution = await resolveMovieUid(
      database,
      movieInfo,
      movieDetails,
    );
    const translationsBatch = [...movieResolution.translations];

    appendJapaneseTitle(
      translationsBatch,
      movieDetails,
      movieResolution.movieUid,
    );
    const posterUrlsBatch = await collectPosterUrls(
      context,
      movieDetails,
      movieResolution.movieUid,
    );
    const referenceUrlData = buildReferenceUrlData(
      movieInfo,
      movieResolution.movieUid,
    );
    const nominationData = buildNominationData(
      movieInfo,
      movieResolution.movieUid,
      ceremonyUid,
      main,
    );

    logProcessedMovie(movieInfo, movieDetails, movieResolution.wasExisting);

    return {
      translations: translationsBatch,
      posterUrls: posterUrlsBatch,
      referenceUrl: referenceUrlData,
      nomination: nominationData,
    };
  } catch (error) {
    console.error(`Error processing movie ${movieInfo.title}:`, error);
    return undefined;
  }
}
