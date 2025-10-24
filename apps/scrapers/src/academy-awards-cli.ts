/**
 * アカデミー賞スクレイピングのCLIエントリーポイント
 */
import path from 'node:path';
import {config} from 'dotenv';
import {type Environment} from '@shine/database';
import academyAwards from './academy-awards';

// 環境変数を読み込み（まずはデフォルトの場所から試行）
config();
// もしくはプロジェクトルートから明示的に読み込み
if (!process.env.TURSO_DATABASE_URL_DEV) {
  const environmentPath = path.resolve(process.cwd(), '../.env');
  config({path: environmentPath});
}

// 環境変数から設定を取得
const environment: Environment = {
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL_DEV || '',
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN_DEV || '',
  TMDB_API_KEY: process.env.TMDB_API_KEY || '',
  TMDB_LEAD_ACCESS_TOKEN: process.env.TMDB_LEAD_ACCESS_TOKEN || '',
  OMDB_API_KEY: process.env.OMDB_API_KEY || '',
};

/**
 * アカデミー賞スクレイピングのメイン処理
 */
async function main() {
  try {
    // コマンドライン引数を解析
    const arguments_ = process.argv.slice(2);
    const seedIndex = arguments_.indexOf('--seed');
    const shouldSeed = seedIndex !== -1;

    if (shouldSeed) {
      console.log('アカデミー賞マスターデータのシードを開始します');
    } else {
      console.log('アカデミー賞スクレイピングを開始します');
    }

    // 環境変数の確認
    if (!environment.TURSO_DATABASE_URL || !environment.TURSO_AUTH_TOKEN) {
      console.error('データベース接続情報が不足しています。');
      console.error(
        'TURSO_DATABASE_URL_DEV と TURSO_AUTH_TOKEN_DEV を設定してください。',
      );
      throw new Error('Missing database connection info');
    }

    if (!environment.TMDB_API_KEY) {
      console.warn(
        '警告: TMDB_API_KEY が設定されていません。IMDb ID の取得がスキップされます。',
      );
    }

    // スクレイピング処理を実行
    const url = shouldSeed ? 'http://localhost/seed' : 'http://localhost/';
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
}

// ヘルプオプションの処理
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsage();
} else {
  // メイン処理を実行
  await main();
}
