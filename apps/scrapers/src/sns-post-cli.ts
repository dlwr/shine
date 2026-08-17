#!/usr/bin/env -S tsx

/**
 * 今日のデイリーセレクションをBlueskyとXへ投稿するCLI。
 *
 * 使い方:
 *   pnpm run sns-post --dry-run   投稿せず本文とカード情報を表示
 *   pnpm run sns-post             実際に投稿する
 *   pnpm run sns-post --quiz      デイリーセレクションではなく今日のクイズを告知する
 *
 * 必要な環境変数(実投稿時、設定があるサービスにだけ投稿する):
 *   BLUESKY_IDENTIFIER   例: shine-film.com
 *   BLUESKY_APP_PASSWORD アプリパスワード
 *   X_API_KEY / X_API_KEY_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET
 */
import process from 'node:process';
import {loadEnvironmentFiles} from './common/environment';
import {
  buildAvailabilityLabels,
  type AvailabilityEntry,
} from './sns/availability-labels';
import {
  buildPostRecord,
  createSession,
  publishPost,
  uploadBlob,
} from './sns/bluesky';
import {
  buildDailyPostText,
  buildQuizPostText,
  buildQuizShareUrl,
  buildQuizXPostText,
  buildXPostText,
} from './sns/post-text';
import {postTweet, type XCredentials} from './sns/x';

loadEnvironmentFiles();

const SITE_URL = 'https://shine-film.com';
const API_URL =
  process.env.SHINE_API_URL ?? 'https://shine-api.yuta25.workers.dev';
const MAX_TEXT_ORGANIZATIONS = 2;
const MAX_TEXT_AVAILABILITY = 2;

type SelectionMovie = {
  uid: string;
  title?: string;
  year?: number;
  nominations?: Array<{organization: {name: string; shortName?: string}}>;
  availability?: AvailabilityEntry[];
};

async function fetchDailyMovie(): Promise<SelectionMovie> {
  const response = await fetch(`${API_URL}/?locale=ja`, {
    headers: {Origin: SITE_URL},
  });

  if (!response.ok) {
    throw new Error(`Selection API failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as {daily?: SelectionMovie};
  if (!data.daily?.uid || !data.daily.title) {
    throw new Error('No daily selection found');
  }

  return data.daily;
}

async function fetchQuizPuzzle(): Promise<{date: string; poolSize: number}> {
  const response = await fetch(`${API_URL}/quiz/daily`, {
    headers: {Origin: SITE_URL},
  });

  if (!response.ok) {
    throw new Error(`Quiz API failed: HTTP ${response.status}`);
  }

  return (await response.json()) as {date: string; poolSize: number};
}

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

type PostPlan = {
  text: string;
  xText: string;
  link: {uri: string; title: string; description: string};
  imageUrl: string;
};

async function buildDailyPlan(): Promise<PostPlan> {
  const movie = await fetchDailyMovie();
  const title = movie.title!;
  const organizations = [
    ...new Set(
      (movie.nominations ?? []).map(
        nomination =>
          nomination.organization.shortName || nomination.organization.name,
      ),
    ),
  ];
  const availabilityLabels = buildAvailabilityLabels(movie.availability ?? []);

  const postInput = {
    title,
    year: movie.year,
    organizations: organizations.slice(0, MAX_TEXT_ORGANIZATIONS),
    availabilityLabels: availabilityLabels.slice(0, MAX_TEXT_AVAILABILITY),
  };
  const text = buildDailyPostText(postInput);
  const xText = buildXPostText({
    ...postInput,
    url: `${SITE_URL}/movies/${movie.uid}`,
  });

  return {
    text,
    xText,
    link: {
      uri: `${SITE_URL}/movies/${movie.uid}`,
      title: `${title}${movie.year ? ` (${movie.year})` : ''} | SHINE`,
      description: `『${title}』をいま観られるかをまとめています。`,
    },
    imageUrl: `${SITE_URL}/og/movie.png?id=${movie.uid}`,
  };
}

async function buildQuizPlan(): Promise<PostPlan> {
  // 出題日はAPIに従う(ジョブの起動が遅れても昨日の問題を告知しない)
  const puzzle = await fetchQuizPuzzle();
  const url = buildQuizShareUrl({siteUrl: SITE_URL, date: puzzle.date});

  return {
    text: buildQuizPostText(puzzle),
    xText: buildQuizXPostText({...puzzle, url}),
    link: {
      uri: url,
      title: '今日の映画クイズ | SHINE',
      description:
        'ポスターの一部と5つのヒントから、今日の1本を当てる。毎日1問。',
    },
    imageUrl: `${SITE_URL}/og/quiz.png?date=${puzzle.date}`,
  };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const plan = process.argv.includes('--quiz')
    ? await buildQuizPlan()
    : await buildDailyPlan();

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
  try {
    await postToBluesky(plan.text, plan.imageUrl, plan.link);
  } catch (error) {
    errors.push(error as Error);
    console.error('Bluesky: 投稿に失敗しました:', error);
  }

  try {
    await postToX(plan.xText);
  } catch (error) {
    errors.push(error as Error);
    console.error('X: 投稿に失敗しました:', error);
  }

  if (errors.length > 0) {
    throw new Error(`${errors.length}件の投稿が失敗しました`);
  }
}

try {
  await main();
} catch (error) {
  console.error('投稿処理に失敗しました:', error);
  process.exitCode = 1;
}
