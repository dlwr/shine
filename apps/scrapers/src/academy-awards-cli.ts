/**
 * アカデミー賞スクレイピングのCLIエントリーポイント
 */
import academyAwards from './academy-awards';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

/**
 * アカデミー賞スクレイピングのメイン処理
 */
async function main() {
  try {
    // コマンドライン引数を解析
    const arguments_ = process.argv.slice(2);
    const knownOptions = new Set(['--seed', '--dry-run']);
    const unknownOptions = arguments_.filter(
      argument => !knownOptions.has(argument),
    );
    if (unknownOptions.length > 0) {
      showUsage();
      throw new Error(`不明なオプション: ${unknownOptions.join(', ')}`);
    }

    const shouldSeed = arguments_.includes('--seed');
    const isDryRun = arguments_.includes('--dry-run');

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

// 使用方法の表示
function showUsage() {
  console.log('使用方法:');
  console.log('  pnpm run scrapers:academy-awards [オプション]');
  console.log('');
  console.log('オプション:');
  console.log(
    '  --seed          マスターデータ（組織・カテゴリ・セレモニー）のシードを実行',
  );
  console.log('  --dry-run       データベースへ書き込まず、処理内容のみ表示');
  console.log('  --help, -h      このヘルプを表示');
  console.log('');
  console.log('説明:');
  console.log('  Wikipediaからアカデミー賞作品賞のノミネーション情報を');
  console.log('  スクレイピングし、データベースに保存します。');
  console.log('  受賞作品と候補作品の両方が含まれます。');
  console.log('');
  console.log('例:');
  console.log('  pnpm run scrapers:academy-awards --seed    # 初回実行時');
  console.log(
    '  pnpm run scrapers:academy-awards           # 通常のスクレイピング',
  );
  console.log(
    '  pnpm run scrapers:academy-awards --dry-run # 書き込まずに確認',
  );
}

// ヘルプオプションの処理
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsage();
} else {
  // メイン処理を実行
  await main();
}
