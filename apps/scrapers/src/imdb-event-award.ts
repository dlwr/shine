import {getDatabase, type Environment} from '@shine/database';
import {PERSON_OVERRIDES} from './common/person-overrides';
import {
  ensureCategory,
  ensureCeremony,
  ensureOrganization,
} from './imdb-event-award/award-records';
import {extractAwardEditions} from './imdb-event-award/editions';
import {processEdition} from './imdb-event-award/process-edition';
import {emptyImportStats} from './imdb-event-award/stats';
import {
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
  type ImportContext,
} from './imdb-event-award/types';

export {extractAwardEditions} from './imdb-event-award/editions';
export type {
  ImdbEventAwardConfig,
  ImdbEventCollectedData,
  ImdbEventEdition,
  ImdbEventImportStats,
  ImdbEventNomination,
  ImdbEventNominationTitle,
} from './imdb-event-award/types';

export async function importImdbEventAward({
  environment,
  data,
  config,
  dryRun = false,
  year,
  throttleMs = 300,
  personOverrides = PERSON_OVERRIDES,
}: {
  environment: Environment;
  data: ImdbEventCollectedData;
  config: ImdbEventAwardConfig;
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
  personOverrides?: ReadonlyMap<string, number>;
}): Promise<ImdbEventImportStats> {
  const stats = emptyImportStats();

  const allEditions = extractAwardEditions(data, config);
  const editions =
    year === undefined
      ? allEditions
      : allEditions.filter(edition => edition.year === year);

  if (editions.length === 0) {
    console.log('No editions to process.');
    return stats;
  }

  if (dryRun) {
    for (const edition of editions) {
      const winners = edition.films.filter(film => film.isWinner);
      console.log(
        `[DRY RUN] ${edition.year} (ceremony #${config.ceremonyNumber(edition.year) ?? '?'}): ${edition.films.length} films, winners: ${
          winners.map(film => film.originalTitle ?? film.title).join(', ') ||
          'none'
        }`,
      );
      stats.editionsProcessed++;
    }

    return stats;
  }

  const database = getDatabase(environment);
  const context: ImportContext = {
    database,
    config,
    tmdbApiKey: environment.TMDB_API_KEY,
    throttleMs,
    stats,
    personOverrides,
  };

  const organizationUid = await ensureOrganization(database, config);
  const categoryUid = await ensureCategory(database, organizationUid, config);

  for (const edition of editions) {
    console.log(`\nProcessing ${config.organizationName} ${edition.year}...`);
    const ceremonyUid = await ensureCeremony(
      database,
      organizationUid,
      edition.year,
      config,
    );
    await processEdition(context, edition, ceremonyUid, categoryUid);
    stats.editionsProcessed++;
  }

  console.log('\nImport summary:');
  console.log(`  Editions processed: ${stats.editionsProcessed}`);
  console.log(`  Movies created: ${stats.moviesCreated}`);
  console.log(`  Movies existing: ${stats.moviesExisting}`);
  console.log(`  Skipped (soft-deleted): ${stats.skippedSoftDeleted}`);
  console.log(`  Nominations created: ${stats.nominationsCreated}`);
  console.log(`  Winners updated: ${stats.winnersUpdated}`);
  console.log(`  TMDb not found: ${stats.tmdbNotFound}`);
  console.log(`  People unresolved: ${stats.peopleUnresolved}`);
  console.log(`  Failed: ${stats.failed}`);

  return stats;
}
