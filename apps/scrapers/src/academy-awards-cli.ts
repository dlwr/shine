/**
 * アカデミー賞スクレイピングのCLIエントリーポイント
 */
import {Command} from 'commander';
import {seedAcademyAwards} from '@shine/database/seeds/academy-awards';
import {scrapeAcademyAwards} from './academy-awards';
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

    if (shouldSeed) {
      if (isDryRun) {
        console.log('[DRY RUN] Would seed academy awards master data');
      } else {
        await seedAcademyAwards(environment);
      }

      console.log('アカデミー賞マスターデータのシードが正常に完了しました');
      return;
    }

    await scrapeAcademyAwards({
      environment,
      tmdbApiKey: environment.TMDB_API_KEY,
      isDryRun,
    });
    console.log('アカデミー賞スクレイピングが正常に完了しました');
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
