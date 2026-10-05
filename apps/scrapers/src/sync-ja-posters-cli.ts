/**
 * 日本語ポスターの無い外国映画について、TMDb に上がった日本語ポスターを取り込むCLI
 */
import {Command} from 'commander';
import {integerAtLeast} from './common/cli-options';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {findJaPosterCandidates, syncJaPosters} from './ja-posters';

export function createCommand(): Command {
  return new Command()
    .name('sync-ja-posters')
    .description(
      [
        '邦題があり日本語ポスターの無い外国映画について、TMDb の画像を取り直し、',
        '日本語ポスターがあれば取り込みます。日本語以外のポスターは足しません。',
      ].join('\n'),
    )
    .option(
      '--limit <count>',
      '照会する映画の件数上限',
      integerAtLeast(1, 'limit'),
    )
    .option(
      '--dry-run',
      '実際の書き込みは行わず、見つかった映画のみ表示',
      false,
    )
    .option(
      '--throttle <ms>',
      'TMDbリクエスト間の待機ミリ秒 (デフォルト: 150)',
      integerAtLeast(0, 'throttle'),
      150,
    )
    .addHelpText(
      'after',
      `
例:
  pnpm scrapers sync-ja-posters --limit 20 --dry-run
  pnpm scrapers sync-ja-posters
`,
    )
    .action(
      async (options: {limit?: number; dryRun: boolean; throttle: number}) => {
        try {
          loadEnvironmentFiles();
          const environment = buildEnvironment(process.env);

          assertDatabaseEnvironment(environment);

          if (!environment.TMDB_API_KEY) {
            throw new Error('TMDB_API_KEY が設定されていません。');
          }

          const candidates = await findJaPosterCandidates({
            environment,
            today: new Date().toISOString().slice(0, 10),
          });
          const targets =
            options.limit === undefined
              ? candidates
              : candidates.slice(0, options.limit);

          const stats = await syncJaPosters({
            environment,
            candidates: targets,
            isDryRun: options.dryRun,
            throttleMs: options.throttle,
            onFound(candidate, posterCount) {
              console.log(
                `  ${candidate.jaTitle} (${candidate.year ?? '?'}) ${posterCount}枚 ${candidate.uid}`,
              );
            },
          });

          console.log('\n結果:');
          console.log(`  照会: ${stats.checked}`);
          console.log(`  日本語ポスターあり: ${stats.found}`);
          console.log(`  失敗: ${stats.failed}`);

          if (stats.failed > 0) {
            process.exitCode = 1;
          }
        } catch (error) {
          console.error(
            '日本語ポスターの取り込み中にエラーが発生しました:',
            error,
          );
          process.exitCode = 1;
        }
      },
    );
}
