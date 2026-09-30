import process from 'node:process';
import {Command} from 'commander';
import {type Environment} from '@shine/database';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './environment';
import {integerAtLeast, oneOf} from './cli-options';

export type AwardImportCliOptions<Award extends {category: string}> = {
  name: string;
  description: string[];
  firstYear: number;
  yearDescription?: string;
  awards: Award[];
  importAwards: (options: {
    environment: Environment;
    awards?: Award[];
    dryRun?: boolean;
    year?: number;
    throttleMs?: number;
  }) => Promise<{failed: number}>;
};

export function createAwardImportCommand<Award extends {category: string}>({
  name,
  description,
  firstYear,
  yearDescription = '取り込む映画祭の開催年を1つに絞る',
  awards,
  importAwards,
}: AwardImportCliOptions<Award>): Command {
  const categories = awards.map(award => award.category);

  return new Command()
    .name(name)
    .description(description.join('\n'))
    .option('--year <year>', yearDescription, integerAtLeast(firstYear, 'year'))
    .option(
      '--category <name>',
      '取り込む部門を1つに絞る',
      oneOf(categories, 'category'),
    )
    .option('--dry-run', '実際の書き込みは行わず、取得結果のみ表示', false)
    .option(
      '--throttle <ms>',
      'TMDb呼び出し間の待機ミリ秒',
      integerAtLeast(0, 'throttle'),
      300,
    )
    .addHelpText(
      'after',
      `
部門:
${categories.map(category => `  ${category}`).join('\n')}

例:
  pnpm scrapers ${name} --dry-run
  pnpm scrapers ${name} --year ${new Date().getFullYear()}
  pnpm scrapers ${name} --category "${categories[0]}"
`,
    )
    .action(
      async (options: {
        year?: number;
        category?: string;
        dryRun: boolean;
        throttle: number;
      }) => {
        loadEnvironmentFiles();
        const environment = buildEnvironment(process.env);

        if (!options.dryRun) {
          assertDatabaseEnvironment(environment);
        }

        const stats = await importAwards({
          environment,
          awards:
            options.category === undefined
              ? undefined
              : awards.filter(award => award.category === options.category),
          dryRun: options.dryRun,
          year: options.year,
          throttleMs: options.throttle,
        });

        if (stats.failed > 0) {
          process.exitCode = 1;
        }
      },
    );
}
