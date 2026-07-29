/**
 * カンヌ映画祭スクレイピングのCLIエントリーポイント
 */
import cannesFilmFestival from './cannes-film-festival';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

/**
 * カンヌ映画祭スクレイピングのメイン処理
 */
async function main() {
  try {
    // コマンドライン引数を解析
    const arguments_ = process.argv.slice(2);
    const yearIndex = arguments_.indexOf('--year');
    const winnersOnlyFlag = arguments_.includes('--winners-only');
    const dryRunFlag = arguments_.includes('--dry-run');
    let targetYear: number | undefined;

    if (yearIndex !== -1 && arguments_[yearIndex + 1]) {
      targetYear = Number.parseInt(arguments_[yearIndex + 1], 10);

      if (
        Number.isNaN(targetYear) ||
        targetYear < 1946 ||
        targetYear > new Date().getFullYear()
      ) {
        console.error('無効な年です。1946年以降の年を指定してください。');
        throw new Error('Invalid year');
      }

      if (winnersOnlyFlag) {
        console.log(
          `カンヌ映画祭受賞作品の更新を開始します (対象年: ${targetYear})`,
        );
      } else {
        console.log(
          `カンヌ映画祭スクレイピングを開始します (対象年: ${targetYear})`,
        );
      }
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

    if (dryRunFlag) {
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
  } catch (error) {
    console.error('スクレイピング処理中にエラーが発生しました:', error);
    throw error;
  }
}

// 使用方法の表示
function showUsage() {
  console.log('使用方法:');
  console.log('  pnpm run scrapers:cannes-film-festival [オプション]');
  console.log('');
  console.log('オプション:');
  console.log('  --year <年>      特定の年のみ処理 (例: --year 2024)');
  console.log('  --winners-only   受賞作品のisWinnerのみを更新（軽量モード）');
  console.log('  --dry-run        実際の書き込みは行わず、処理内容のみ表示');
  console.log('  --help, -h       このヘルプを表示');
  console.log('');
  console.log('説明:');
  console.log(
    '  Wikipediaからカンヌ国際映画祭のコンペティション参加映画情報を',
  );
  console.log('  スクレイピングし、データベースに保存します。');
  console.log("  Palme d'Or（パルム・ドール）受賞作品も含まれます。");
  console.log('');
  console.log(
    '  --winners-only オプションを使用すると、既存のノミネーションの',
  );
  console.log('  isWinnerフラグのみを更新し、新規映画の取得やポスターの');
  console.log('  ダウンロードはスキップされます。');
  console.log('');
  console.log('例:');
  console.log('  pnpm run scrapers:cannes-film-festival');
  console.log('  pnpm run scrapers:cannes-film-festival --year 2024');
  console.log('  pnpm run scrapers:cannes-film-festival --winners-only');
  console.log(
    '  pnpm run scrapers:cannes-film-festival --year 2024 --winners-only',
  );
  console.log('  pnpm run scrapers:cannes-film-festival --dry-run');
}

// ヘルプオプションの処理
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsage();
} else {
  // メイン処理を実行
  await main();
}
