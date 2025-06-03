/**
 * Wikipedia日本語版から映画タイトルをスクレイピングするモジュール
 */
import * as cheerio from "cheerio";
import { fetchWithRetry } from "../../common/fetch-utilities.js";
import {
  extractMainTitle,
  extractWikipediaJsonLD,
  parseHTML,
} from "../../common/parser-utilities.js";

/**
 * IMDb IDからWikipedia日本語版の映画タイトルを取得
 * @param imdbId IMDb ID
 * @returns 日本語タイトル (見つからない場合はundefined)
 */
export async function scrapeJapaneseTitleFromWikipedia(
  imdbId: string
): Promise<string | undefined> {
  try {
    // まずIMDb IDで日本語版Wikipediaを検索
    const searchUrl = `https://ja.wikipedia.org/w/index.php?search=${imdbId}`;
    const searchHtml = await fetchWithRetry(searchUrl);
    const $search = parseHTML(searchHtml);

    // 検索ページから映画ページへのリンクを探す
    const moviePageUrl = findMoviePageUrl($search);

    if (!moviePageUrl) {
      console.log(`No Wikipedia page found for IMDb ID: ${imdbId}`);
      return undefined;
    }

    // 映画ページのHTMLを取得
    const moviePageHtml = await fetchWithRetry(moviePageUrl);
    const $moviePage = parseHTML(moviePageHtml);

    // タイトルの抽出を試みる
    const title = extractMovieTitle($moviePage);

    if (title) {
      console.log(`Found Japanese title for IMDb ID ${imdbId}: ${title}`);
      return title;
    }

    return undefined;
  } catch (error) {
    console.error(`Error scraping Wikipedia for IMDb ID ${imdbId}:`, error);
    return undefined;
  }
}

/**
 * 検索ページから映画ページへのURLを見つける
 * @param $ Cheerioインスタンス
 * @returns 映画ページのURL (見つからない場合はundefined)
 */
function findMoviePageUrl($: cheerio.CheerioAPI): string | undefined {
  // 検索結果の最初のリンクを取得
  const firstResult = $(".mw-search-result-heading a").first();

  if (firstResult.length > 0) {
    const href = firstResult.attr("href");
    if (href) {
      return `https://ja.wikipedia.org${href}`;
    }
  }

  // 検索結果がない場合は、リダイレクト先のページを確認
  const pageTitle = $("h1#firstHeading").text();
  if (pageTitle && !pageTitle.includes("検索結果")) {
    // 検索ではなく直接ページに飛んだ場合
    return `https://ja.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`;
  }

  return undefined;
}

/**
 * Wikipediaページから映画タイトルを抽出
 * @param $ Cheerioインスタンス
 * @returns 日本語タイトル
 */
function extractMovieTitle($: cheerio.CheerioAPI): string | undefined {
  // 方法1: ページタイトルから取得
  const pageTitle = $("h1#firstHeading").text().trim();
  if (pageTitle) {
    return extractMainTitle(pageTitle);
  }

  // 方法2: infoboxから取得
  const infoboxTitle = $(
    '.infobox th:contains("邦題"), .infobox th:contains("日本語題")'
  )
    .next("td")
    .text()
    .trim();
  if (infoboxTitle) {
    return extractMainTitle(infoboxTitle);
  }

  // 方法3: JSON-LDデータから取得
  const jsonLd = extractWikipediaJsonLD($);
  if (jsonLd && typeof jsonLd.name === "string") {
    return extractMainTitle(jsonLd.name);
  }

  // 見つからなかった場合
  return undefined;
}
