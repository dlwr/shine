/**
 * X (Twitter) API v2 への投稿クライアント。
 * OAuth 1.0a user context で署名し POST /2/tweets を叩く。
 * JSONボディはOAuth 1.0aの署名対象に含まれない。
 */
import {createHmac, randomBytes} from 'node:crypto';

const TWEETS_ENDPOINT = 'https://api.x.com/2/tweets';

export type XCredentials = {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

export function percentEncode(value: string): string {
  return encodeURIComponent(value).replaceAll(
    /[!'()*]/g,
    character => `%${character.codePointAt(0)!.toString(16).toUpperCase()}`,
  );
}

type OAuth1HeaderOptions = XCredentials & {
  method: string;
  url: string;
  nonce: string;
  timestamp: number;
  extraParams?: Record<string, string>;
};

export function buildOAuth1Header({
  method,
  url,
  consumerKey,
  consumerSecret,
  accessToken,
  accessTokenSecret,
  nonce,
  timestamp,
  extraParams: extraParameters = {},
}: OAuth1HeaderOptions): string {
  const oauthParameters: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(timestamp),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  const allParameters = {...oauthParameters, ...extraParameters};
  const parameterString = Object.entries(allParameters)
    .map(([key, value]) => [percentEncode(key), percentEncode(value)])
    .toSorted(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const signatureBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(parameterString),
  ].join('&');
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(
    accessTokenSecret,
  )}`;
  const signature = createHmac('sha1', signingKey)
    .update(signatureBase)
    .digest('base64');

  const headerParameters = {...oauthParameters, oauth_signature: signature};
  const header = Object.entries(headerParameters)
    .toSorted(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(', ');

  return `OAuth ${header}`;
}

export async function postTweet(
  credentials: XCredentials,
  text: string,
): Promise<{id: string}> {
  const authorization = buildOAuth1Header({
    ...credentials,
    method: 'POST',
    url: TWEETS_ENDPOINT,
    nonce: randomBytes(16).toString('hex'),
    timestamp: Math.floor(Date.now() / 1000),
  });

  const response = await fetch(TWEETS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({text}),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`X API /2/tweets failed: ${response.status} ${body}`);
  }

  const result = (await response.json()) as {data: {id: string}};
  return {id: result.data.id};
}
