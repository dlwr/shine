/**
 * カンヌ映画祭スクレイピングのCLIエントリーポイント
 */
import {Command, InvalidArgumentError} from 'commander';
import cannesFilmFestival from './cannes-film-festival';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

function parseYear(value: string): number {
  const year = Number.parseInt(value, 10);

  if (Number.isNaN(year) || year < 1946 || year > new Date().getFullYear()) {
    throw new InvalidArgumentError(
      '無効な年です。1946年以降の年を指定してください。',
    );
  }

  return year;
}

const program = new Command();

program
  .name('cannes-film-festival-cli')
  .description(
    [
      'Wikipediaからカンヌ国際映画祭のコンペティション参加映画情報を',
      'スクレイピングし、データベースに保存します。',
      "Palme d'Or（パルム・ドール）受賞作品も含まれます。",
      '',
      '--winners-only オプションを使用すると、既存のノミネーションの',
      'isWinnerフラグのみを更新し、新規映画の取得やポスターの',
      'ダウンロードはスキップされます。',
    ].join('\n'),
  )
  .option('--year <year>', '特定の年のみ処理 (例: --year 2024)', parseYear)
  .option('--winners-only', '受賞作品のisWinnerのみを更新（軽量モード）', false)
  .option('--dry-run', '実際の書き込みは行わず、処理内容のみ表示', false)
  .addHelpText(
    'after',
    `
例:
  pnpm run scrapers:cannes-film-festival
  pnpm run scrapers:cannes-film-festival --year 2024
  pnpm run scrapers:cannes-film-festival --winners-only
  pnpm run scrapers:cannes-film-festival --year 2024 --winners-only
  pnpm run scrapers:cannes-film-festival --dry-run
`,
  )
  .action(
    async (options: {year?: number; winnersOnly: boolean; dryRun: boolean}) => {
      const targetYear = options.year;
      const winnersOnlyFlag = options.winnersOnly;

      if (targetYear && winnersOnlyFlag) {
        console.log(
          `カンヌ映画祭受賞作品の更新を開始します (対象年: ${targetYear})`,
        );
      } else if (targetYear) {
        console.log(
          `カンヌ映画祭スクレイピングを開始します (対象年: ${targetYear})`,
        );
      } else if (winnersOnlyFlag) {
        console.log('カンヌ映画祭受賞作品の更新を開始します');
      } else {
        console.log('カンヌ映画祭スクレイピングを開始します');
      }

      // 環境変数の確認
      assertDatabaseEnvironment(environment);

      if (!environment.TMDB_API_KEY) {
        console.warn(
          '警告: TMDB_API_KEY が設定されていません。IMDb ID の取得がスキップされます。',
        );
      }

      // スクレイピング処理を実行
      let url = 'http://localhost/';
      const searchParameters = new URLSearchParams();

      if (targetYear) {
        searchParameters.append('year', targetYear.toString());
      }

      if (winnersOnlyFlag) {
        searchParameters.append('winners-only', 'true');
      }

      if (options.dryRun) {
        searchParameters.append('dry-run', 'true');
      }

      if (searchParameters.toString()) {
        url += `?${searchParameters.toString()}`;
      }

      const request = new Request(url);
      const response = await cannesFilmFestival.fetch(request, environment);

      if (response.status === 200) {
        if (winnersOnlyFlag) {
          console.log('カンヌ映画祭受賞作品の更新が正常に完了しました');
        } else {
          console.log('カンヌ映画祭スクレイピングが正常に完了しました');
        }
      } else {
        const errorText = await response.text();
        console.error('スクレイピング中にエラーが発生しました:', errorText);
        throw new Error(errorText);
      }
    },
  );

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error('スクレイピング処理中にエラーが発生しました:', error);
  process.exitCode = 1;
}
