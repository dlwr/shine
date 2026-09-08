/**
 * アカデミー賞スクレイピングのCLIエントリーポイント
 */
import {Command} from 'commander';
import academyAwards from './academy-awards';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';

/**
 * アカデミー賞スクレイピングのメイン処理
 */
async function main(options: {seed: boolean; dryRun: boolean}) {
  loadEnvironmentFiles();
  const environment = buildEnvironment(process.env);

  try {
    const shouldSeed = options.seed;
    const isDryRun = options.dryRun;

    if (isDryRun) {
      console.log('dry-run モードで実行します（書き込みは行いません）');
    }

    if (shouldSeed) {
      console.log('アカデミー賞マスターデータのシードを開始します');
    } else {
      console.log('アカデミー賞スクレイピングを開始します');
    }

    assertDatabaseEnvironment(environment);

    if (!environment.TMDB_API_KEY) {
      console.warn(
        '警告: TMDB_API_KEY が設定されていません。IMDb ID の取得がスキップされます。',
      );
    }

    // スクレイピング処理を実行
    const url = new URL(
      shouldSeed ? 'http://localhost/seed' : 'http://localhost/',
    );
    if (isDryRun) {
      url.searchParams.set('dry-run', 'true');
    }

    const request = new Request(url);
    const response = await academyAwards.fetch(request, environment);

    if (response.status === 200) {
      const message = shouldSeed
        ? 'アカデミー賞マスターデータのシードが正常に完了しました'
        : 'アカデミー賞スクレイピングが正常に完了しました';
      console.log(message);
    } else {
      const errorText = await response.text();
      console.error('処理中にエラーが発生しました:', errorText);
      throw new Error(errorText);
    }
  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
    throw error;
  }
}

export function createCommand(): Command {
  return new Command()
    .name('academy-awards')
    .description(
      [
        'Wikipediaからアカデミー賞作品賞のノミネーション情報を',
        'スクレイピングし、データベースに保存します。',
        '受賞作品と候補作品の両方が含まれます。',
      ].join('\n'),
    )
    .option(
      '--seed',
      'マスターデータ（組織・カテゴリ・セレモニー）のシードを実行',
      false,
    )
    .option('--dry-run', 'データベースへ書き込まず、処理内容のみ表示', false)
    .addHelpText(
      'after',
      `
例:
  pnpm scrapers academy-awards --seed    # 初回実行時
  pnpm scrapers academy-awards           # 通常のスクレイピング
  pnpm scrapers academy-awards --dry-run # 書き込まずに確認
`,
    )
    .action(main);
}
