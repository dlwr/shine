/**
 * Bluesky (atproto) への投稿クライアント。
 * リンクはURLテキストではなく external embed(リンクカード)として付ける。
 */
const SERVICE_URL = 'https://bsky.social';

type BlobReference = {
  $type: 'blob';
  ref: {$link: string};
  mimeType: string;
  size: number;
};

type ExternalLink = {
  uri: string;
  title: string;
  description: string;
};

type PostRecordInput = {
  text: string;
  createdAt: string;
  link: ExternalLink;
  thumb?: BlobReference;
};

export type PostRecord = {
  $type: 'app.bsky.feed.post';
  text: string;
  createdAt: string;
  langs: string[];
  embed: {
    $type: 'app.bsky.embed.external';
    external: ExternalLink & {thumb?: BlobReference};
  };
};

export function buildPostRecord({
  text,
  createdAt,
  link,
  thumb,
}: PostRecordInput): PostRecord {
  return {
    $type: 'app.bsky.feed.post',
    text,
    createdAt,
    langs: ['ja'],
    embed: {
      $type: 'app.bsky.embed.external',
      external: {...link, ...(thumb ? {thumb} : {})},
    },
  };
}

type Session = {
  did: string;
  accessJwt: string;
};

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${SERVICE_URL}/xrpc/${path}`, init);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bluesky API ${path} failed: ${response.status} ${body}`);
  }

  return (await response.json()) as T;
}

export async function createSession(
  identifier: string,
  password: string,
): Promise<Session> {
  return requestJson<Session>('com.atproto.server.createSession', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({identifier, password}),
  });
}

export async function uploadBlob(
  session: Session,
  bytes: ArrayBuffer,
  mimeType: string,
): Promise<BlobReference> {
  const result = await requestJson<{blob: BlobReference}>(
    'com.atproto.repo.uploadBlob',
    {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        Authorization: `Bearer ${session.accessJwt}`,
      },
      body: bytes,
    },
  );

  return result.blob;
}

export async function publishPost(
  session: Session,
  record: PostRecord,
): Promise<{uri: string}> {
  return requestJson<{uri: string}>('com.atproto.repo.createRecord', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  });
}
