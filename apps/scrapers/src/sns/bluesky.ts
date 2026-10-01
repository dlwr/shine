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

export type TagFacet = {
  index: {byteStart: number; byteEnd: number};
  features: Array<{$type: 'app.bsky.richtext.facet#tag'; tag: string}>;
};

export type PostRecord = {
  $type: 'app.bsky.feed.post';
  text: string;
  createdAt: string;
  langs: string[];
  facets?: TagFacet[];
  embed: {
    $type: 'app.bsky.embed.external';
    external: ExternalLink & {thumb?: BlobReference};
  };
};

export function detectTagFacets(text: string): TagFacet[] {
  const encoder = new TextEncoder();
  const facets: TagFacet[] = [];

  for (const match of text.matchAll(/#([^\s#]+)/g)) {
    const byteStart = encoder.encode(text.slice(0, match.index)).length;
    const byteEnd = byteStart + encoder.encode(match[0]).length;
    facets.push({
      index: {byteStart, byteEnd},
      features: [{$type: 'app.bsky.richtext.facet#tag', tag: match[1]}],
    });
  }

  return facets;
}

export function buildPostRecord({
  text,
  createdAt,
  link,
  thumb,
}: PostRecordInput): PostRecord {
  const facets = detectTagFacets(text);
  return {
    $type: 'app.bsky.feed.post',
    text,
    createdAt,
    langs: ['ja'],
    ...(facets.length > 0 && {facets}),
    embed: {
      $type: 'app.bsky.embed.external',
      external: {...link, ...(thumb && {thumb})},
    },
  };
}

type Session = {
  did: string;
  accessJwt: string;
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${SERVICE_URL}/xrpc/${path}`, init);

    if (response.ok) {
      return (await response.json()) as T;
    }

    const body = await response.text();
    if (response.status < 500 || attempt >= MAX_ATTEMPTS) {
      throw new Error(`Bluesky API ${path} failed: ${response.status} ${body}`);
    }

    console.warn(
      `Bluesky API ${path}: ${response.status} のため ${RETRY_DELAY_MS}ms 後に再試行します`,
    );
    await new Promise(resolve => {
      setTimeout(resolve, RETRY_DELAY_MS);
    });
  }
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
