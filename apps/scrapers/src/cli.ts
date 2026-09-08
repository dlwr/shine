/**
 * scrapers の CLI エントリーポイント。各 *-cli.ts をサブコマンドとして束ねる。
 *
 * 使い方:
 *   pnpm scrapers --help
 *   pnpm scrapers <command> --help
 *   pnpm scrapers venice-film-festival --year 2026 --dry-run
 */
import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {Command} from 'commander';
import {createCommand as academyAwards} from './academy-awards-cli';
import {createCommand as academyPersonAwards} from './academy-person-awards-cli';
import {createCommand as assignImdbIds} from './assign-imdb-ids-cli';
import {createCommand as availabilityCheck} from './availability-check-cli';
import {createCommand as backfillPosters} from './backfill-posters-cli';
import {createCommand as baftaAwards} from './bafta-awards-cli';
import {createCommand as berlinFilmFestival} from './berlin-film-festival-cli';
import {createCommand as berlinJuryAwards} from './berlin-jury-awards-cli';
import {createCommand as berlinPersonAwards} from './berlin-person-awards-cli';
import {createCommand as blueRibbonAwards} from './blue-ribbon-awards-cli';
import {createCommand as cannesFillImdbIds} from './cannes-fill-imdb-ids-cli';
import {createCommand as cannesFilmFestival} from './cannes-film-festival-cli';
import {createCommand as cannesJuryAwards} from './cannes-jury-awards-cli';
import {createCommand as cannesPalmeDor} from './cannes-palme-dor-cli';
import {createCommand as cannesPersonAwards} from './cannes-person-awards-cli';
import {createCommand as deleteOrphanMovies} from './delete-orphan-movies-cli';
import {createCommand as fixDefaultTranslations} from './fix-default-translations-cli';
import {createCommand as fixJapaneseTitleContamination} from './fix-japanese-title-contamination-cli';
import {createCommand as fixMisattributedNominations} from './fix-misattributed-nominations-cli';
import {createCommand as fixOriginalLanguages} from './fix-original-languages-cli';
import {createCommand as fixPosterContamination} from './fix-poster-contamination-cli';
import {createCommand as goldenGlobeAwards} from './golden-globe-awards-cli';
import {createCommand as hochiFilmAwards} from './hochi-film-awards-cli';
import {createCommand as importImdbList} from './import-imdb-list-cli';
import {createCommand as japanAcademyAwards} from './japan-academy-awards-cli';
import {createCommand as japanAcademyPersonAwards} from './japan-academy-person-awards-cli';
import {createCommand as japanPersonAwards} from './japan-person-awards-cli';
import {createCommand as japaneseTranslations} from './japanese-translations-cli';
import {createCommand as kinemaJunpo} from './kinema-junpo-cli';
import {createCommand as mainichiFilmConcours} from './mainichi-film-concours-cli';
import {createCommand as mainichiPersonNominations} from './mainichi-person-nominations-cli';
import {createCommand as movieCredits} from './movie-credits-cli';
import {createCommand as movieDescriptions} from './movie-descriptions-cli';
import {createCommand as movieImport} from './movie-import-from-list-cli';
import {createCommand as nikkanSportsFilmAwards} from './nikkan-sports-film-awards-cli';
import {createCommand as northStarReport} from './north-star-report-cli';
import {createCommand as personEnglishNames} from './person-english-names-cli';
import {createCommand as snsPost} from './sns-post-cli';
import {createCommand as tmdbJaWorklist} from './tmdb-ja-worklist-cli';
import {createCommand as tursoUsageAlert} from './turso-usage-alert-cli';
import {createCommand as veniceFilmFestival} from './venice-film-festival-cli';
import {createCommand as veniceJuryAwards} from './venice-jury-awards-cli';
import {createCommand as venicePersonAwards} from './venice-person-awards-cli';
import {createCommand as wikidataJapaneseNames} from './wikidata-japanese-names-cli';
import {createCommand as wikidataJapaneseTitles} from './wikidata-japanese-titles-cli';
import {createCommand as yokohamaFilmFestival} from './yokohama-film-festival-cli';

const commandFactories: Array<() => Command> = [
  movieImport,
  academyAwards,
  japanAcademyAwards,
  japanAcademyPersonAwards,
  academyPersonAwards,
  baftaAwards,
  goldenGlobeAwards,
  cannesPersonAwards,
  venicePersonAwards,
  berlinPersonAwards,
  cannesPalmeDor,
  cannesFillImdbIds,
  cannesJuryAwards,
  veniceJuryAwards,
  berlinJuryAwards,
  japanPersonAwards,
  mainichiPersonNominations,
  assignImdbIds,
  backfillPosters,
  deleteOrphanMovies,
  fixMisattributedNominations,
  importImdbList,
  availabilityCheck,
  japaneseTranslations,
  wikidataJapaneseTitles,
  wikidataJapaneseNames,
  cannesFilmFestival,
  veniceFilmFestival,
  berlinFilmFestival,
  kinemaJunpo,
  mainichiFilmConcours,
  blueRibbonAwards,
  hochiFilmAwards,
  nikkanSportsFilmAwards,
  yokohamaFilmFestival,
  movieCredits,
  personEnglishNames,
  movieDescriptions,
  tmdbJaWorklist,
  fixDefaultTranslations,
  fixOriginalLanguages,
  fixPosterContamination,
  fixJapaneseTitleContamination,
  snsPost,
  tursoUsageAlert,
  northStarReport,
];

export function createProgram(): Command {
  const program = new Command()
    .name('scrapers')
    .description('SHINE のスクレイパー・保守ツール');

  for (const createCommand of commandFactories) {
    const command = createCommand();
    program.addCommand(
      command.summary(command.description().split('\n', 1)[0] ?? ''),
    );
  }

  return program;
}

const isEntryModule =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntryModule) {
  await createProgram().parseAsync(process.argv);
}
