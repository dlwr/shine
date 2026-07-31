#!/usr/bin/env -S tsx

/**
 * 今日のデイリーセレクションをBlueskyへ投稿するCLI。
 *
 * 使い方:
 *   pnpm run sns-post --dry-run   投稿せず本文とカード情報を表示
 *   pnpm run sns-post             実際に投稿する
 *
 * 必要な環境変数(実投稿時):
 *   BLUESKY_IDENTIFIER   例: shine-film.com
 *   BLUESKY_APP_PASSWORD アプリパスワード
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
import {buildDailyPostText} from './sns/post-text';

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

async function fetchOgImage(
  movieUid: string,
): Promise<ArrayBuffer | undefined> {
  const response = await fetch(`${SITE_URL}/og/movie.png?id=${movieUid}`);
  return response.ok ? response.arrayBuffer() : undefined;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

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

  const text = buildDailyPostText({
    title,
    year: movie.year,
    organizations: organizations.slice(0, MAX_TEXT_ORGANIZATIONS),
    availabilityLabels: availabilityLabels.slice(0, MAX_TEXT_AVAILABILITY),
  });

  const link = {
    uri: `${SITE_URL}/movies/${movie.uid}`,
    title: `${title}${movie.year ? ` (${movie.year})` : ''} | SHINE`,
    description: `『${title}』をいま観られるかをまとめています。`,
  };

  console.log('--- 投稿内容 ---');
  console.log(text);
  console.log('--- リンクカード ---');
  console.log(`uri:   ${link.uri}`);
  console.log(`title: ${link.title}`);
  console.log(`thumb: ${SITE_URL}/og/movie.png?id=${movie.uid}`);

  if (isDryRun) {
    console.log('\n(dry-run: 投稿していません)');
    return;
  }

  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) {
    throw new Error(
      'BLUESKY_IDENTIFIER と BLUESKY_APP_PASSWORD を設定してください。',
    );
  }

  const session = await createSession(identifier, password);
  const ogImage = await fetchOgImage(movie.uid);
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

  console.log(`\n投稿しました: ${result.uri}`);
}

try {
  await main();
} catch (error) {
  console.error('投稿処理に失敗しました:', error);
  process.exitCode = 1;
}
