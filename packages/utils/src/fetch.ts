/**
 * HTTPリクエスト関連のユーティリティ関数
 */

const DEFAULT_TIMEOUT_MS = 15_000;

export class FetchHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP error! Status: ${status}`);
    this.name = 'FetchHttpError';
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(value) - Date.now();
  return Number.isNaN(dateMs) ? undefined : Math.max(0, dateMs);
}

/**
 * リトライ機能付きのfetch
 * - タイムアウト: AbortSignal.timeoutで打ち切り(デフォルト15秒)
 * - 429: Retry-Afterヘッダを尊重して待機しリトライ
 * - 5xx・ネットワークエラー: 指数バックオフでリトライ
 * - 429以外の4xx: リトライせず即エラー
 * @param url 取得するURL
 * @param options fetchオプション
 * @param retries リトライ回数
 * @param delay リトライ間の待機時間(ms)
 * @param timeoutMs リクエストタイムアウト(ms)
 * @returns レスポンスのテキスト
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3,
  delay = 1000,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  let retriesLeft = retries;
  let currentDelay = delay;

  for (;;) {
    let response: Response;

    try {
      response = await fetch(url, {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          ...options.headers,
        },
      });
    } catch (error) {
      if (retriesLeft <= 0) {
        throw error;
      }

      console.warn(
        `Fetch failed, retrying in ${currentDelay}ms... (${retriesLeft} retries left)`,
      );
      await sleep(currentDelay);
      retriesLeft--;
      currentDelay *= 1.5;
      continue;
    }

    if (response.ok) {
      try {
        return await response.text();
      } catch (error) {
        if (retriesLeft <= 0) {
          throw error;
        }

        console.warn(
          `Reading response failed, retrying in ${currentDelay}ms... (${retriesLeft} retries left)`,
        );
        await sleep(currentDelay);
        retriesLeft--;
        currentDelay *= 1.5;
        continue;
      }
    }

    const {status} = response;

    if (status === 429 && retriesLeft > 0) {
      const waitMs =
        parseRetryAfter(response.headers.get('retry-after')) ?? currentDelay;
      console.warn(
        `Rate limited (429), retrying in ${waitMs}ms... (${retriesLeft} retries left)`,
      );
      await sleep(waitMs);
      retriesLeft--;
      currentDelay *= 1.5;
      continue;
    }

    if (status >= 500 && retriesLeft > 0) {
      console.warn(
        `Fetch failed with status ${status}, retrying in ${currentDelay}ms... (${retriesLeft} retries left)`,
      );
      await sleep(currentDelay);
      retriesLeft--;
      currentDelay *= 1.5;
      continue;
    }

    throw new FetchHttpError(status);
  }
}

/**
 * リトライ機能付きのfetch(JSONレスポンス用)
 * @param url 取得するURL
 * @param options fetchオプション
 * @param retries リトライ回数
 * @param delay リトライ間の待機時間(ms)
 * @param timeoutMs リクエストタイムアウト(ms)
 * @returns パース済みのJSON
 */
export async function fetchJsonWithRetry<T>(
  url: string,
  options: RequestInit = {},
  retries = 3,
  delay = 1000,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const text = await fetchWithRetry(url, options, retries, delay, timeoutMs);
  return JSON.parse(text) as T;
}

/**
 * URLエンコード済みのクエリパラメータを追加したURLを生成
 * @param baseUrl ベースURL
 * @param params クエリパラメータ
 * @returns 完全なURL
 */
export function buildUrl(
  baseUrl: string,
  parameters: Record<string, string>,
): string {
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.append(key, value);
  }

  return url.href;
}
