import * as cheerio from 'cheerio';
import {type Environment} from '@shine/database';
import {nominations} from '@shine/database/schema/nominations';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import {seedAcademyAwards} from '@shine/database/seeds/academy-awards';
import {
  processMovieForBatch,
  type ScrapeContext,
} from './academy-awards/import-movie';
import {
  analyzeTableStructure,
  processTableRows,
  WIKIPEDIA_BASE_URL,
} from './academy-awards/wikipedia-table';
import {getScrapeDatabase} from './common/dry-run';
import {fetchWithRetry} from '@shine/utils/fetch';

const ACADEMY_AWARDS_URL = `${WIKIPEDIA_BASE_URL}/wiki/Academy_Award_for_Best_Picture`;

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
