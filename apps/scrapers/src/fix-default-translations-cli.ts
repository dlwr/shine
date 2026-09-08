/**
 * デフォルト翻訳を原語の行に付け替えるCLI
 */
import {Command} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {getScrapeDatabase} from './common/dry-run';
import {fixDefaultTranslations} from './fix-default-translations';

export function createCommand(): Command {
  return new Command()
    .name('fix-default-translations')
    .description(
      [
        '映画の原語と一致する翻訳行に isDefault を付け替えます。',
        '原語の行が無い映画は変更しません。',
      ].join('\n'),
    )
    .option('--dry-run', '書き込みは行わず、対象のみ表示', false)
    .addHelpText(
      'after',
      `
例:
  pnpm scrapers fix-default-translations --dry-run
  pnpm scrapers fix-default-translations
`,
    )
    .action(async (options: {dryRun: boolean}) => {
      try {
        loadEnvironmentFiles();
        const environment = buildEnvironment(process.env);

        assertDatabaseEnvironment(environment);

        const database = getScrapeDatabase({
          environment,
          isDryRun: options.dryRun,
        });

        const result = await fixDefaultTranslations(
          {database, isDryRun: options.dryRun},
          {
            onFix(movieUid, resourceType, language) {
              console.log(`  ${movieUid} ${resourceType} -> ${language}`);
            },
          },
        );

        console.log('\n結果:');
        console.log(`  書き換えた行: ${result.updated}`);
        console.log(`  対象の映画: ${result.moviesChanged}`);
      } catch (error) {
        console.error('デフォルト翻訳の修正中にエラーが発生しました:', error);
        process.exitCode = 1;
      }
    });
}
