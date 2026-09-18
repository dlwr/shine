/**
 * 今日のデイリーセレクションをBlueskyとXへ投稿するCLI。
 *
 * 使い方:
 *   pnpm scrapers sns-post --dry-run   投稿せず本文とカード情報を表示
 *   pnpm scrapers sns-post             実際に投稿する
 *   pnpm scrapers sns-post --quiz      デイリーセレクションではなく今日のクイズを告知する
 *   pnpm scrapers sns-post --watched   今週の観た映画チェック(週替わりで1リスト)を告知する
 *   pnpm scrapers sns-post --person    今週の映画人(個人賞の受賞者から週替わりで1人)を紹介する
 *   pnpm scrapers sns-post --monthly   今月の1本を告知する(1日)
 *   pnpm scrapers sns-post --monthly-preview
 *                                      来月の1本を予告する(20日)
 *   pnpm scrapers sns-post --monthly-reminder
 *                                      今月の1本の再告知と集まった記事・ポストの件数(15日)
 *   pnpm scrapers sns-post --monthly-links
 *                                      今月の1本に他人の記事・ポストが付いたら紹介する
 *                                      (未紹介のものが無ければ投稿しない)
 *   pnpm scrapers sns-post --monthly-roundup
 *                                      今月の1本に集まった記事・ポストのまとめと来月の予告(月末)
 *                                      予告は ADMIN_PASSWORD があるときだけ付く
 *   pnpm scrapers sns-post --announce <name>
 *                                      data/sns-announcements/<name>.json の本文を1回だけ流す
 *
 * 必要な環境変数(実投稿時、設定があるサービスにだけ投稿する):
 *   BLUESKY_IDENTIFIER   例: shine-film.com
 *   BLUESKY_APP_PASSWORD アプリパスワード
 *   X_API_KEY / X_API_KEY_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET
 */
import process from 'node:process';
import {Command} from 'commander';
import {loadEnvironmentFiles} from './common/environment';
import {buildAnnouncementPlan} from './sns/plans/announcement';
import {buildDailyPlan} from './sns/plans/daily';
import {
  buildMonthlyLinksPlan,
  buildMonthlyPlan,
  buildMonthlyPreviewPlan,
  buildMonthlyReminderPlan,
  buildMonthlyRoundupPlan,
} from './sns/plans/monthly';
import {buildPersonPlan} from './sns/plans/person';
import {buildQuizPlan} from './sns/plans/quiz';
import {buildWatchedPlan} from './sns/plans/watched';
import {type PostPlan} from './sns/post-plan';
import {publishPlan} from './sns/publish';

type SnsPostOptions = {
  dryRun: boolean;
  quiz: boolean;
  watched: boolean;
  person: boolean;
  monthly: boolean;
  monthlyPreview: boolean;
  monthlyReminder: boolean;
  monthlyLinks: boolean;
  monthlyRoundup: boolean;
  announce?: string;
};

async function buildPlan(
  options: SnsPostOptions,
): Promise<PostPlan | undefined> {
  if (options.announce !== undefined) {
    if (!options.announce || options.announce.startsWith('--')) {
      throw new Error('--announce には告知名を指定してください');
    }

    return buildAnnouncementPlan(options.announce);
  }

  if (options.quiz) {
    return buildQuizPlan();
  }

  if (options.watched) {
    return buildWatchedPlan();
  }

  if (options.person) {
    return buildPersonPlan();
  }

  if (options.monthly) {
    return buildMonthlyPlan();
  }

  if (options.monthlyPreview) {
    return buildMonthlyPreviewPlan();
  }

  if (options.monthlyReminder) {
    return buildMonthlyReminderPlan();
  }

  if (options.monthlyLinks) {
    return buildMonthlyLinksPlan();
  }

  if (options.monthlyRoundup) {
    return buildMonthlyRoundupPlan();
  }

  return buildDailyPlan();
}

async function main(options: SnsPostOptions) {
  loadEnvironmentFiles();

  const isDryRun = options.dryRun;
  const plan = await buildPlan(options);

  if (!plan) {
    console.log('投稿するものがありません');
    return;
  }

  console.log('--- Bluesky投稿内容 ---');
  console.log(plan.text);
  console.log('--- リンクカード ---');
  console.log(`uri:   ${plan.link.uri}`);
  console.log(`title: ${plan.link.title}`);
  console.log(`thumb: ${plan.imageUrl}`);
  console.log('--- X投稿内容 ---');
  console.log(plan.xText);

  if (isDryRun) {
    console.log('\n(dry-run: 投稿していません)');
    return;
  }

  await publishPlan(plan);
}

export function createCommand(): Command {
  return new Command()
    .name('sns-post')
    .description(
      [
        '今日のデイリーセレクションをBlueskyとXへ投稿します。',
        '種別のオプションを付けると、代わりにクイズ・観た映画チェック・今週の映画人・今月の1本などを投稿します。',
        '実投稿時は、認証情報が設定されているサービスにだけ投稿します。',
      ].join('\n'),
    )
    .option('--dry-run', '投稿せず本文とカード情報を表示', false)
    .option('--quiz', '今日のクイズを告知する', false)
    .option(
      '--watched',
      '今週の観た映画チェック(週替わりで1リスト)を告知する',
      false,
    )
    .option(
      '--person',
      '今週の映画人(個人賞の受賞者から週替わりで1人)を紹介する',
      false,
    )
    .option('--monthly', '今月の1本を告知する(1日)', false)
    .option(
      '--monthly-preview',
      '来月の1本を予告する(20日)。ADMIN_PASSWORD が要る',
      false,
    )
    .option(
      '--monthly-reminder',
      '今月の1本の再告知と集まった記事・ポストの件数(15日)',
      false,
    )
    .option(
      '--monthly-links',
      '今月の1本に他人の記事・ポストが付いたら紹介する(未紹介のものが無ければ投稿しない)',
      false,
    )
    .option(
      '--monthly-roundup',
      '今月の1本に集まった記事・ポストのまとめと来月の予告(月末)。予告は ADMIN_PASSWORD があるときだけ付く',
      false,
    )
    .option(
      '--announce <name>',
      'data/sns-announcements/<name>.json の本文を1回だけ流す',
    )
    .addHelpText(
      'after',
      `
Environment variables (実投稿時、設定があるサービスにだけ投稿する):
  BLUESKY_IDENTIFIER     例: shine-film.com
  BLUESKY_APP_PASSWORD   アプリパスワード
  X_API_KEY / X_API_KEY_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET
`,
    )
    .action(async (options: SnsPostOptions) => {
      try {
        await main(options);
      } catch (error) {
        console.error('投稿処理に失敗しました:', error);
        process.exitCode = 1;
      }
    });
}
