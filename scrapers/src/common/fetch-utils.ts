/**
 * HTTPリクエスト関連のユーティリティ関数
 */

/**
 * リトライ機能付きのfetch
 * @param url 取得するURL
 * @param options fetchオプション
 * @param retries リトライ回数
 * @param delay リトライ間の待機時間(ms)
 * @returns レスポンスのテキスト
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3,
  delay = 1000
): Promise<string> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    console.warn(
      `Fetch failed, retrying in ${delay}ms... (${retries} retries left)`
    );
    await new Promise((resolve) => setTimeout(resolve, delay));

    return fetchWithRetry(url, options, retries - 1, delay * 1.5);
  }
}

/**
 * URLエンコード済みのクエリパラメータを追加したURLを生成
 * @param baseUrl ベースURL
 * @param params クエリパラメータ
 * @returns 完全なURL
 */
export function buildUrl(
  baseUrl: string,
  parameters: Record<string, string>
): string {
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.append(key, value);
  }

  return url.toString();
}
