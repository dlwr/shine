#!/usr/bin/env -S tsx

/**
 * 今日のデイリーセレクションをBlueskyとXへ投稿するCLI。
 *
 * 使い方:
 *   pnpm run sns-post --dry-run   投稿せず本文とカード情報を表示
 *   pnpm run sns-post             実際に投稿する
 *   pnpm run sns-post --quiz      デイリーセレクションではなく今日のクイズを告知する
 *   pnpm run sns-post --watched   今週の観た映画チェック(週替わりで1リスト)を告知する
 *   pnpm run sns-post --person    今週の映画人(個人賞の受賞者から週替わりで1人)を紹介する
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
import {pickPersonOfWeek} from './sns/person-rotation';
import {
  buildDailyPostText,
  buildPersonPostText,
  buildPersonXPostText,
  buildQuizPostText,
  buildQuizShareUrl,
  buildQuizXPostText,
  buildWatchedPostText,
  buildWatchedXPostText,
  buildXPostText,
} from './sns/post-text';
import {pickWeeklyItem} from './sns/weekly-rotation';
import {postTweet, type XCredentials} from './sns/x';

loadEnvironmentFiles();

const SITE_URL = 'https://shine-film.com';
const API_URL =
  process.env.SHINE_API_URL ?? 'https://shine-api.yuta25.workers.dev';
const MAX_TEXT_ORGANIZATIONS = 2;
const MAX_TEXT_AVAILABILITY = 2;
const PROMINENT_POOL_LIMIT = 200;

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

type AwardSummary = {
  slug: string;
  name: string;
  organization: string;
  grouping: 'year' | 'list' | 'person';
  subAward?: boolean;
};

async function fetchWatchedLists(): Promise<AwardSummary[]> {
  const response = await fetch(`${API_URL}/awards`, {
    headers: {Origin: SITE_URL},
  });

  if (!response.ok) {
    throw new Error(`Awards API failed: HTTP ${response.status}`);
  }

  const {awards} = (await response.json()) as {awards: AwardSummary[]};
  return awards.filter(award => award.grouping === 'year' && !award.subAward);
}

async function fetchWinnerCount(slug: string): Promise<number> {
  const response = await fetch(`${API_URL}/awards/${slug}`, {
    headers: {Origin: SITE_URL},
  });

  if (!response.ok) {
    throw new Error(`Award API failed: HTTP ${response.status}`);
  }

  const {years} = (await response.json()) as {
    years: Array<{movies: Array<{isWinner: boolean}>}>;
  };
  let count = 0;
  for (const group of years) {
    count += group.movies.filter(movie => movie.isWinner).length;
  }

  return count;
}

type ProminentPerson = {
  uid: string;
  name: string;
  wonCount: number;
  nominatedCount: number;
  topMovies: Array<{uid: string; title?: string; year?: number}>;
};

async function fetchProminentPeople(): Promise<{
  directors: ProminentPerson[];
  actors: ProminentPerson[];
}> {
  const response = await fetch(
    `${API_URL}/people/prominent?locale=ja&limit=${PROMINENT_POOL_LIMIT}`,
    {headers: {Origin: SITE_URL}},
  );

  if (!response.ok) {
    throw new Error(`Prominent people API failed: HTTP ${response.status}`);
  }

  return (await response.json()) as {
    directors: ProminentPerson[];
    actors: ProminentPerson[];
  };
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

async function buildWatchedPlan(): Promise<PostPlan> {
  const list = pickWeeklyItem(await fetchWatchedLists(), new Date());
  if (!list) {
    throw new Error('No watched lists found');
  }

  const heading =
    list.organization === list.name
      ? list.name
      : `${list.organization} ${list.name}`;
  const total = await fetchWinnerCount(list.slug);
  const url = `${SITE_URL}/watched/${list.slug}`;

  return {
    text: buildWatchedPostText({heading, total}),
    xText: buildWatchedXPostText({heading, total, url}),
    link: {
      uri: url,
      title: `${heading}受賞作、何本観た？ | SHINE`,
      description: `${heading}の歴代受賞作${total}本にチェックを付けて、観た本数と割合を共有できます。`,
    },
    imageUrl: `${SITE_URL}/og/watched.png?slug=${list.slug}`,
  };
}

async function buildPersonPlan(): Promise<PostPlan> {
  const person = pickPersonOfWeek(await fetchProminentPeople(), new Date());
  if (!person) {
    throw new Error('No awarded people found');
  }

  const url = `${SITE_URL}/people/${person.uid}`;
  const postInput = {
    name: person.name,
    role: person.role,
    wonCount: person.wonCount,
    nominatedCount: person.nominatedCount,
    topMovies: person.topMovies
      .filter(movie => movie.title)
      .map(movie => ({title: movie.title!, year: movie.year})),
  };

  return {
    text: buildPersonPostText(postInput),
    xText: buildPersonXPostText({...postInput, url}),
    link: {
      uri: url,
      title: `${person.name}の映画 | SHINE`,
      description: `${person.name}の受賞歴と関わった映画を、SHINEに収録された映画賞の受賞作・ノミネート作から一覧できます。`,
    },
    imageUrl: `${SITE_URL}/og/person.png?id=${person.uid}`,
  };
}

async function buildPlan(): Promise<PostPlan> {
  if (process.argv.includes('--quiz')) {
    return buildQuizPlan();
  }

  if (process.argv.includes('--watched')) {
    return buildWatchedPlan();
  }

  if (process.argv.includes('--person')) {
    return buildPersonPlan();
  }

  return buildDailyPlan();
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const plan = await buildPlan();

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
    throw new AggregateError(errors, `${errors.length}件の投稿が失敗しました`);
  }
}

try {
  await main();
} catch (error) {
  console.error('投稿処理に失敗しました:', error);
  process.exitCode = 1;
}
