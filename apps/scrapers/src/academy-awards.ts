import * as cheerio from 'cheerio';
import {type Element} from 'domhandler';
import {and, eq, isNull} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import {seedAcademyAwards} from '@shine/database/seeds/academy-awards';
import {
  fetchImdbId,
  fetchJapaneseTitleFromTMDB,
  fetchTMDBMovieImages,
  saveJapaneseTranslation,
  savePosterUrls,
  saveTMDBId,
} from './common/tmdb-utilities';
import {fetchWithRetry} from './common/fetch-utilities';
import {getScrapeDatabase} from './common/dry-run';

const WIKIPEDIA_BASE_URL = 'https://en.wikipedia.org';
const ACADEMY_AWARDS_URL = `${WIKIPEDIA_BASE_URL}/wiki/Academy_Award_for_Best_Picture`;

type TableColumns = {
  filmIndex: number;
  yearIndex: number;
  producerIndex: number;
  tableType: 'film' | 'producer' | 'unknown';
};

type MovieInfo = {
  title: string;
  year: number;
  isWinner: boolean;
  referenceUrl?: string;
  imdbId?: string;
};

type MainData = {
  organizationUid: string;
  categoryUid: string;
  ceremonies: Map<number, string>;
};

type ScrapeContext = {
  environment: Environment;
  tmdbApiKey: string | undefined;
  isDryRun: boolean;
};

export default {
  async fetch(request: Request, environment: Environment): Promise<Response> {
    const url = new URL(request.url);
    const context: ScrapeContext = {
      environment,
      tmdbApiKey: environment.TMDB_API_KEY,
      isDryRun: url.searchParams.get('dry-run') === 'true',
    };

    if (context.isDryRun) {
      console.log('[DRY RUN MODE] データベースへの書き込みは行いません');
    }

    if (url.pathname === '/seed') {
      if (context.isDryRun) {
        console.log('[DRY RUN] Would seed academy awards master data');
        return new Response('Seed skipped (dry run)', {status: 200});
      }

      console.log('seeding academy awards');
      await seedAcademyAwards(context.environment);
      return new Response('Seed completed successfully', {status: 200});
    }

    try {
      await scrapeAcademyAwards(context);
      return new Response('Scraping completed successfully', {status: 200});
    } catch (error) {
      return new Response(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        {status: 500},
      );
    }
  },
};

const fetchMainData = (() => {
  let mainData: MainData | undefined;

  return async function fetchMainData(
    context: ScrapeContext,
  ): Promise<MainData> {
    if (mainData) {
      return mainData;
    }

    const [organization] = await getDatabase(context.environment)
      .select()
      .from(awardOrganizations)
      .where(eq(awardOrganizations.name, 'Academy Awards'));

    if (!organization) {
      throw new Error('Academy Awards organization not found');
    }

    const [category] = await getDatabase(context.environment)
      .select()
      .from(awardCategories)
      .where(
        and(
          eq(awardCategories.shortName, 'Best Picture'),
          eq(awardCategories.organizationUid, organization.uid),
        ),
      );

    if (!category) {
      throw new Error('Best Picture category not found');
    }

    const ceremoniesData = await getDatabase(context.environment)
      .select()
      .from(awardCeremonies)
      .where(eq(awardCeremonies.organizationUid, organization.uid));

    const ceremonies = new Map<number, string>(
      ceremoniesData.map(ceremony => [ceremony.year, ceremony.uid]),
    );

    mainData = {
      organizationUid: organization.uid,
      categoryUid: category.uid,
      ceremonies,
    };

    return mainData;
  };
})();

async function getOrCreateCeremony(
  context: ScrapeContext,
  year: number,
  organizationUid: string,
): Promise<string> {
  const database = getScrapeDatabase(context);
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
      },
    })
    .returning();

  const main = await fetchMainData(context);
  main.ceremonies.set(year, ceremony.uid);

  return ceremony.uid;
}

export async function scrapeAcademyAwards(context: ScrapeContext) {
  try {
    console.log('Fetching data from Wikipedia...');
    const html = await fetchWithRetry(ACADEMY_AWARDS_URL);
    const $ = cheerio.load(html);

    const allTables = [...$('table.wikitable.sortable')];
    console.log(`Found ${allTables.length} wikitable.sortable tables`);

    let moviesProcessed = 0;
    let winnersProcessed = 0;

    // バッチ処理用の配列
    const translationsBatch: Array<typeof translations.$inferInsert> = [];
    const referenceUrlsBatch: Array<typeof referenceUrls.$inferInsert> = [];
    const nominationsBatch: Array<typeof nominations.$inferInsert> = [];

    for (const [tableIndex, table] of allTables.entries()) {
      const tableInfo = analyzeTableStructure($, $(table), tableIndex);

      if (!tableInfo || tableInfo.tableType === 'unknown') {
        continue;
      }

      const movies = processTableRows($, $(table));

      for (const movie of movies) {
        const batchData = await processMovieForBatch(
          context,
          movie.title,
          movie.year,
          movie.isWinner,
          movie.referenceUrl,
        );
        if (batchData) {
          translationsBatch.push(...batchData.translations);
          if (batchData.referenceUrl) {
            referenceUrlsBatch.push(batchData.referenceUrl);
          }

          if (batchData.nomination) {
            nominationsBatch.push(batchData.nomination);
          }
        }

        moviesProcessed++;
        if (movie.isWinner) {
          winnersProcessed++;
        }
      }
    }

    // バッチでデータを挿入
    const database = getScrapeDatabase(context);

    if (translationsBatch.length > 0) {
      console.log(
        `\nInserting ${translationsBatch.length} translations in batch...`,
      );
      await database
        .insert(translations)
        .values(translationsBatch)
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

    console.log(
      `\nScraping completed successfully: ${moviesProcessed} movies processed, ${winnersProcessed} winners`,
    );
  } catch (error) {
    console.error('Error scraping Academy Awards:', error);
    throw error;
  }
}

function analyzeTableStructure(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<Element>,
  tableIndex: number,
): TableColumns | undefined {
  const headerRow = $table.find('tr').first();
  const headerTexts = headerRow
    .find('th')
    .map((_: number, element: Element) =>
      $(element).text().trim().toLowerCase(),
    )
    .get();

  console.log(`Table ${tableIndex} headers: ${headerTexts.join(' | ')}`);

  if (headerTexts.includes('nominations') && headerTexts.includes('wins')) {
    console.log(`Skipping table ${tableIndex} (appears to be statistics)`);
    return undefined;
  }

  let filmIndex = -1;
  let yearIndex = -1;
  let producerIndex = -1;

  headerRow.find('th').each((index: number, element: Element) => {
    const headerText = $(element).text().trim().toLowerCase();

    if (
      (headerText.includes('film') || headerText.includes('picture')) &&
      !headerText.includes('studio')
    ) {
      filmIndex = index;
    } else if (
      headerText.includes('year') ||
      headerText.includes('release') ||
      /^\d{4}(-\d{2})?$/.test(headerText)
    ) {
      yearIndex = index;
    } else if (
      headerText.includes('studio') ||
      headerText.includes('producer')
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

  const tableType: 'film' | 'producer' | 'unknown' = headerTexts.some(text =>
    text.includes('producer'),
  )
    ? 'producer'
    : 'film';

  console.log(
    `Table ${tableIndex}: film=${filmIndex}, year=${yearIndex}, producer=${producerIndex}, type=${tableType}`,
  );

  return {
    filmIndex,
    yearIndex,
    producerIndex,
    tableType,
  };
}

function processTableRows(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<Element>,
): MovieInfo[] {
  const rows = $table.find('tr');
  const result: MovieInfo[] = [];
  let currentYear: number | undefined;
  const processedTitles = new Set<string>();

  console.log(`Processing table with ${rows.length} rows`);

  // 1行目はヘッダーなのでスキップ
  for (let index = 1; index < rows.length; index++) {
    const $row = $(rows[index]);
    const cells = $row.find('td');
    const headers = $row.find('th');

    console.log(`\nProcessing row ${index}:`);
    console.log(`Headers: ${headers.length}, Cells: ${cells.length}`);

    if (cells.length === 0 && headers.length === 0) {
      console.log('Skipping empty row');
      continue;
    }

    const extractedYear = extractYear($row);
    if (extractedYear) {
      console.log(
        `Found new year: ${extractedYear} (previous: ${currentYear})`,
      );
      currentYear = extractedYear;
      processedTitles.clear();
    } else {
      console.log(`Using current year: ${currentYear}`);
    }

    if (!currentYear) {
      console.log('No year available, skipping row');
      continue;
    }

    const {title, referenceUrl, imdbId} = extractMovieTitle($, $row);
    if (!title) {
      console.log('No title found, skipping row');
      continue;
    }

    const dedupeKey = `${currentYear}-${title}`;

    if (processedTitles.has(dedupeKey)) {
      console.log(`Skipping duplicate: ${title} (${currentYear})`);
    } else {
      processedTitles.add(dedupeKey);
      const isWinner = isWinnerRow($row);

      console.log(
        `Adding movie: ${title} (${currentYear}) - ${
          isWinner ? 'Winner' : 'Nominee'
        } ${imdbId ? `IMDb: ${imdbId}` : ''}`,
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

function extractYear($row: cheerio.Cheerio<Element>): number | undefined {
  const rowHeader = $row.find('th').first();
  if (rowHeader.length > 0) {
    const yearText = rowHeader.text().trim();
    console.log('Found year header:', yearText);

    const yearRangeMatch = /(\d{4})[/-](\d{2})/.exec(yearText);
    if (yearRangeMatch) {
      const startYear = Number(yearRangeMatch[1]);
      const endYear = Number(yearRangeMatch[2]);
      const fullEndYear = startYear - (startYear % 100) + endYear;
      console.log(`Extracted year range: ${startYear}-${fullEndYear}`);
      return fullEndYear;
    }

    const singleYearMatch = /(\d{4})/.exec(yearText);
    if (singleYearMatch) {
      const year = Number(singleYearMatch[1]);
      console.log(`Extracted single year: ${year}`);
      return year;
    }
  }

  return undefined;
}

function isWinnerRow($row: cheerio.Cheerio<Element>): boolean {
  const filmCell = $row.find('td').first();

  if (filmCell.find('b').length > 0) {
    return true;
  }

  if (filmCell.attr('style')?.includes('background:#FAEB86')) {
    return true;
  }

  if (filmCell.attr('bgcolor') === '#FAEB86') {
    return true;
  }

  if (filmCell.css('background-color')?.includes('#FAEB86')) {
    return true;
  }

  if (filmCell.text().includes('*')) {
    return true;
  }

  return false;
}

function extractMovieTitle(
  $: cheerio.CheerioAPI,
  $row: cheerio.Cheerio<Element>,
): {title: string; referenceUrl?: string; imdbId?: string} {
  const filmCell = $row.find('td').first();
  if (!filmCell || filmCell.length === 0) {
    return {title: ''};
  }

  let referenceUrl: string | undefined;
  let imdbId: string | undefined;

  const italicElements = filmCell.find('i');
  const linkElement = filmCell.find('a').first();

  // IMDBリンクを探す
  filmCell.find('a').each((_: number, element: Element) => {
    const href = $(element).attr('href');
    if (href?.includes('imdb.com')) {
      imdbId = /\/title\/(tt\d+)/.exec(href)?.[1];
    }
  });

  if (linkElement.length > 0) {
    const href = linkElement.attr('href');
    if (href) {
      referenceUrl = `${WIKIPEDIA_BASE_URL}${href}`;
    }
  }

  let title =
    italicElements.length > 0
      ? italicElements.first().text().trim()
      : filmCell.text().trim();

  if (linkElement.length > 0) {
    const linkText = linkElement.first().text().trim();
    if (linkText.length > 0 && linkText.length < title.length) {
      title = linkText;
    }
  }

  return {title: cleanupTitle(title), referenceUrl, imdbId};
}

function cleanupTitle(title: string): string {
  return title
    .replaceAll(/\s*\([^)]*\)/g, '')
    .replaceAll(/\s*\[[^\]]*]/g, '')
    .replaceAll('*', '')
    .trim();
}

type DatabaseClient = ReturnType<typeof getDatabase>;

type ExistingMovie =
  | {status: 'active'; uid: string; imdbId: string | null}
  | {status: 'soft-deleted'}
  | {status: 'missing'};

async function findExistingMovie(
  database: DatabaseClient,
  title: string,
  imdbId: string | undefined,
): Promise<ExistingMovie> {
  if (imdbId) {
    const [movieWithImdbId] = await database
      .select({
        uid: movies.uid,
        imdbId: movies.imdbId,
        deletedAt: movies.deletedAt,
      })
      .from(movies)
      .where(eq(movies.imdbId, imdbId))
      .limit(1);

    if (movieWithImdbId) {
      return movieWithImdbId.deletedAt === null
        ? {
            status: 'active',
            uid: movieWithImdbId.uid,
            imdbId: movieWithImdbId.imdbId,
          }
        : {status: 'soft-deleted'};
    }
  }

  const [movieWithTitle] = await database
    .select({uid: movies.uid, imdbId: movies.imdbId})
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
    .where(and(eq(translations.content, title), isNull(movies.deletedAt)))
    .limit(1);

  return movieWithTitle
    ? {status: 'active', uid: movieWithTitle.uid, imdbId: movieWithTitle.imdbId}
    : {status: 'missing'};
}

async function processMovieForBatch(
  context: ScrapeContext,
  title: string,
  year: number,
  isWinner: boolean,
  referenceUrl?: string,
): Promise<
  | {
      translations: Array<typeof translations.$inferInsert>;
      referenceUrl?: typeof referenceUrls.$inferInsert;
      nomination?: typeof nominations.$inferInsert;
    }
  | undefined
> {
  try {
    const main = await fetchMainData(context);
    const database = getScrapeDatabase(context);

    if (context.isDryRun) {
      const existing = await findExistingMovie(database, title, undefined);
      console.log(
        `[DRY RUN] Would process ${existing.status} movie: ${title} (${year}) - ${
          isWinner ? 'Winner' : 'Nominee'
        }`,
      );
      return undefined;
    }

    // IMDb IDを取得
    let imdbId: string | undefined;
    if (context.tmdbApiKey) {
      imdbId = await fetchImdbId(title, year, context.tmdbApiKey);
    }

    const existing = await findExistingMovie(database, title, imdbId);

    if (existing.status === 'soft-deleted') {
      console.log(`Skipping soft-deleted movie: ${title} (${imdbId})`);
      return undefined;
    }

    const isNewMovie = existing.status === 'missing';
    let movieUid: string;
    const translationsBatch: Array<typeof translations.$inferInsert> = [];

    if (existing.status === 'active') {
      movieUid = existing.uid;
      // IMDb IDが新しく取得できた場合は更新（差分チェック付き）
      if (imdbId && !existing.imdbId) {
        await database
          .update(movies)
          .set({
            imdbId,
          })
          .where(eq(movies.uid, movieUid));
        console.log(`Updated IMDb ID for ${title}: ${imdbId}`);
      }
    } else {
      // 新規映画の作成
      const [newMovie] = await database
        .insert(movies)
        .values({
          originalLanguage: 'en',
          year,
          imdbId: imdbId || undefined,
        })
        .returning();
      if (!newMovie) {
        throw new Error(`Failed to create movie: ${title}`);
      }

      movieUid = newMovie.uid;
      // 英語タイトルをバッチに追加
      translationsBatch.push({
        resourceType: 'movie_title',
        resourceUid: movieUid,
        languageCode: 'en',
        content: title,
        isDefault: 1,
      });
    }

    // 参照URL
    let referenceUrlData: typeof referenceUrls.$inferInsert | undefined;
    if (referenceUrl) {
      referenceUrlData = {
        movieUid,
        url: referenceUrl,
        sourceType: 'wikipedia',
        languageCode: 'en',
        isPrimary: 1,
      };
    }

    // ノミネーション
    const ceremonyUid = await getOrCreateCeremony(
      context,
      year,
      main.organizationUid,
    );
    const nominationData: typeof nominations.$inferInsert = {
      movieUid,
      ceremonyUid,
      categoryUid: main.categoryUid,
      isWinner: isWinner ? 1 : 0,
    };

    // 日本語タイトルとポスターの処理（新規映画の場合のみ）
    if (isNewMovie && imdbId && context.tmdbApiKey) {
      // 日本語タイトルの取得・保存
      const japaneseTitle = await fetchJapaneseTitleFromTMDB(
        imdbId,
        undefined,
        context.environment,
      );
      if (japaneseTitle) {
        await saveJapaneseTranslation(
          movieUid,
          japaneseTitle,
          context.environment,
        );
      }

      // ポスターの取得・保存
      const movieImages = await fetchTMDBMovieImages(
        imdbId,
        context.tmdbApiKey,
      );
      if (movieImages) {
        // TMDB IDを保存（まだ保存されていない場合）
        const currentMovie = await database
          .select({tmdbId: movies.tmdbId})
          .from(movies)
          .where(eq(movies.uid, movieUid))
          .limit(1);
        if (currentMovie.length > 0 && !currentMovie[0].tmdbId) {
          await saveTMDBId(imdbId, movieImages.tmdbId, context.environment);
        }

        // ポスターを保存
        const posterCount = await savePosterUrls(
          movieUid,
          movieImages.images.posters,
          context.environment,
        );
        if (posterCount > 0) {
          console.log(`  Saved ${posterCount} posters for ${title}`);
        }
      }
    }

    console.log(
      `Processed ${
        isNewMovie ? 'new' : 'updated'
      } movie: ${title} (${year}) - ${isWinner ? 'Winner' : 'Nominee'} ${
        imdbId ? `IMDb: ${imdbId}` : ''
      }`,
    );

    return {
      translations: translationsBatch,
      referenceUrl: referenceUrlData,
      nomination: nominationData,
    };
  } catch (error) {
    console.error(`Error processing movie ${title}:`, error);
    return undefined;
  }
}
