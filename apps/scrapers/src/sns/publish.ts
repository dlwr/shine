import process from 'node:process';
import {
  buildPostRecord,
  createSession,
  publishPost,
  uploadBlob,
} from './bluesky';
import {type PostPlan} from './post-plan';
import {postTweet, type XCredentials} from './x';

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

export async function publishPlan(plan: PostPlan): Promise<void> {
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
