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
import {
  buildPostRecord,
  createSession,
  publishPost,
  uploadBlob,
} from './sns/bluesky';
import {buildAnnouncementPlan} from './sns/plans/announcement';
import {buildDailyPlan} from './sns/plans/daily';
import {
  buildMonthlyLinksPlan,
  buildMonthlyPlan,
  buildMonthlyReminderPlan,
  buildMonthlyRoundupPlan,
} from './sns/plans/monthly';
import {buildPersonPlan} from './sns/plans/person';
import {buildQuizPlan} from './sns/plans/quiz';
import {buildWatchedPlan} from './sns/plans/watched';
import {type PostPlan} from './sns/post-plan';
import {postTweet, type XCredentials} from './sns/x';

async function fetchOgImage(url: string): Promise<ArrayBuffer | undefined> {
  const response = await fetch(url);
  return response.ok ? response.arrayBuffer() : undefined;
}

function getXCredentials(): XCredentials | undefined {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_KEY_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  return consumerKey && consumerSecret && accessToken && accessTokenSecret
    ? {consumerKey, consumerSecret, accessToken, accessTokenSecret}
    : undefined;
}

async function postToBluesky(
  text: string,
  imageUrl: string,
  link: {uri: string; title: string; description: string},
): Promise<void> {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) {
    console.log('Bluesky: 認証情報が無いためスキップします');
    return;
  }

  const session = await createSession(identifier, password);
  const ogImage = await fetchOgImage(imageUrl);
  const thumb = ogImage
    ? await uploadBlob(session, ogImage, 'image/png')
    : undefined;

  const result = await publishPost(
    session,
    buildPostRecord({
      text,
      createdAt: new Date().toISOString(),
      link,
      thumb,
    }),
  );

  console.log(`Bluesky: 投稿しました ${result.uri}`);
}

async function postToX(text: string): Promise<void> {
  const credentials = getXCredentials();
  if (!credentials) {
    console.log('X: 認証情報が無いためスキップします');
    return;
  }

  const result = await postTweet(credentials, text);
  console.log(`X: 投稿しました https://x.com/i/status/${result.id}`);
}

type SnsPostOptions = {
  dryRun: boolean;
  quiz: boolean;
  watched: boolean;
  person: boolean;
  monthly: boolean;
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

  const errors: Error[] = [];
  let isPosted = false;
  try {
    await postToBluesky(plan.text, plan.imageUrl, plan.link);
    isPosted = true;
  } catch (error) {
    errors.push(error as Error);
    console.error('Bluesky: 投稿に失敗しました:', error);
  }

  try {
    await postToX(plan.xText);
    isPosted = true;
  } catch (error) {
    errors.push(error as Error);
    console.error('X: 投稿に失敗しました:', error);
  }

  // 片方でも出ていれば記録する(次の実行で同じ投稿をもう一度出さないため)
  if (isPosted) {
    await plan.afterPost?.();
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, `${errors.length}件の投稿が失敗しました`);
  }
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
