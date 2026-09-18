/**
 * デフォルト翻訳を原語の行に付け替えるCLI
 */
import {Command} from 'commander';
import {applyOption, dryRunOption, isDryRun} from './common/write-mode';
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
    .addOption(applyOption())
    .addOption(dryRunOption())
    .addHelpText(
      'after',
      `
例:
  pnpm scrapers fix-default-translations
  pnpm scrapers fix-default-translations --apply
`,
    )
    .action(async (options: {apply?: boolean}) => {
      try {
        loadEnvironmentFiles();
        const environment = buildEnvironment(process.env);

        assertDatabaseEnvironment(environment);

        const database = getScrapeDatabase({
          environment,
          isDryRun: isDryRun(options),
        });

        const result = await fixDefaultTranslations(
          {database, isDryRun: isDryRun(options)},
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
