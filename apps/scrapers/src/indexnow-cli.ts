/**
 * その日に中身が変わった URL を IndexNow（Bing・Yandex 等）へ知らせる。
 *
 * 使い方:
 *   pnpm scrapers indexnow --dry-run   送らずに対象の URL を表示
 *   pnpm scrapers indexnow             実際に送る
 */
import process from 'node:process';
import {Command} from 'commander';
import {loadEnvironmentFiles} from './common/environment';
import {buildIndexNowUrls, submitIndexNow} from './indexnow';
import {fetchSelections} from './sns/api-client';

async function main(options: {dryRun: boolean}): Promise<void> {
  loadEnvironmentFiles();

  try {
    const selections = await fetchSelections();
    const urls = buildIndexNowUrls(
      selections,
      new Date().toISOString().slice(0, 10),
    );

    for (const url of urls) {
      console.log(url);
    }

    if (options.dryRun) {
      console.log('(dry-run: IndexNow へは送信しない)');
      return;
    }

    await submitIndexNow(urls);
    console.log(`IndexNow へ ${urls.length} 件を送信しました`);
  } catch (error) {
    console.error('IndexNow への送信に失敗しました:', error);
    process.exitCode = 1;
  }
}

export function createCommand(): Command {
  return new Command()
    .name('indexnow')
    .description(
      'その日に中身が変わった URL を IndexNow へ知らせます（ホーム・日替わり一覧・切り替わった選出の映画ページ）',
    )
    .option('--dry-run', '送信せずに対象の URL を表示する', false)
    .action(main);
}
