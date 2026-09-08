import {Command} from 'commander';
import {importMoviesFromList} from './movie-import-from-list';
import {buildEnvironment, loadEnvironmentFiles} from './common/environment';

async function main(
  filePath: string,
  awardName: string,
  limitArgument: string | undefined,
  options: {dryRun: boolean},
): Promise<void> {
  loadEnvironmentFiles();

  const isDryRun = options.dryRun;
  const limit = limitArgument ? Number(limitArgument) : undefined;

  // 環境変数から設定を取得
  const tursoUrl = process.env.TURSO_DATABASE_URL;

  // 必要な環境変数をチェック
  if (!tursoUrl) {
    console.error('Error: TURSO_DATABASE_URL environment variable is required');
    process.exitCode = 1;
    return;
  }

  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  if (!tursoToken) {
    console.error('Error: TURSO_AUTH_TOKEN environment variable is required');
    process.exitCode = 1;
    return;
  }

  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) {
    console.error('Error: TMDB_API_KEY environment variable is required');
    process.exitCode = 1;
    return;
  }

  const environment = buildEnvironment(process.env);

  try {
    console.log(`Starting import from: ${filePath}`);
    console.log(`Award name: ${awardName}`);
    if (limit) {
      console.log(`Limit: ${limit} movies`);
    }

    console.log('---');

    await importMoviesFromList(
      filePath,
      awardName,
      'Selected Films',
      environment,
      limit,
      isDryRun,
    );

    console.log('---');
    console.log('Import completed successfully!');
  } catch (error) {
    console.error('Import failed:', error);
    process.exitCode = 1;
    return;
  }
}

export function createCommand(): Command {
  return new Command()
    .name('movie-import')
    .description(
      'JSON の映画リストから映画を取り込み、賞の候補として登録します',
    )
    .argument('<json-file-path>', '映画リストの JSON ファイル')
    .argument('<award-name>', '賞の名前')
    .argument('[limit]', '処理する件数の上限')
    .option('--dry-run', 'データベースへ書き込まず、処理内容のみ表示', false)
    .addHelpText(
      'after',
      `
例:
  pnpm scrapers movie-import ./tmp/1000_movies.json "Best 1000 Movies"
  pnpm scrapers movie-import ./tmp/1000_movies.json "Best 1000 Movies" 5
  pnpm scrapers movie-import ./tmp/1000_movies.json "Best 1000 Movies" --dry-run
`,
    )
    .action(main);
}
