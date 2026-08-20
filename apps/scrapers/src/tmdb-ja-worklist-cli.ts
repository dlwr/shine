/**
 * TMDbへ手動投稿するためのja翻訳ワークリストを生成するCLI
 */
import fs from 'node:fs/promises';
import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {buildTmdbJaWorklist} from './tmdb-ja-worklist';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('1以上の整数を指定してください。');
  }

  return parsed;
}

function parseDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidArgumentError('YYYY-MM-DD形式で指定してください。');
  }

  return value;
}

const program = new Command();

program
  .name('tmdb-ja-worklist')
  .description(
    [
      'TMDbにja翻訳が無い（または不完全な）映画のワークリストをJSONで出力します。',
      '対象は、うちのDBにかな入り邦題があり、jaあらすじが無い映画です。',
      'TMDb APIで裏取りし、邦題・enタイトル・enあらすじ・編集URLを載せます。',
      '書き込みは行いません。',
    ].join('\n'),
  )
  .option('--limit <n>', '照会する映画の件数上限', parsePositiveInteger)
  .option('--throttle <ms>', 'リクエスト間隔(ms)', parsePositiveInteger, 150)
  .option(
    '--selection-date <date>',
    'その日の選出映画（daily/weekly/monthly）だけを対象にする',
    parseDate,
  )
  .option('--out <path>', '出力先ファイル（省略時は標準出力）')
  .addHelpText(
    'after',
    `
例:
  pnpm run scrapers:tmdb-ja-worklist --limit 10
  pnpm run scrapers:tmdb-ja-worklist --limit 100 --out worklist.json
  pnpm run scrapers:tmdb-ja-worklist --selection-date 2026-08-21
`,
  )
  .action(
    async (options: {
      limit?: number;
      throttle: number;
      selectionDate?: string;
      out?: string;
    }) => {
      assertDatabaseEnvironment(environment);

      if (!environment.TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY が設定されていません。');
      }

      const {items, stats} = await buildTmdbJaWorklist({
        environment,
        limit: options.limit,
        throttleMs: options.throttle,
        selectionDate: options.selectionDate,
        onProgress(done, total) {
          if (done === total || done % 50 === 0) {
            console.error(`  ${done}/${total}`);
          }
        },
      });

      const json = JSON.stringify(items, undefined, 2);
      if (options.out) {
        await fs.writeFile(options.out, `${json}\n`);
        console.error(`ワークリストを ${options.out} に書き出しました。`);
      } else {
        console.log(json);
      }

      console.error('\n結果:');
      console.error(`  照会: ${stats.candidates}`);
      console.error(`  ワークリスト: ${stats.listed}`);
      console.error(`  TMDbに整備済み: ${stats.tmdbComplete}`);
      console.error(`  失敗: ${stats.failed}`);

      if (stats.failed > 0) {
        process.exitCode = 1;
      }
    },
  );

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error('ワークリスト生成中にエラーが発生しました:', error);
  process.exitCode = 1;
}
