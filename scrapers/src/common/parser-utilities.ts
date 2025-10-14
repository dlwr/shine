/**
 * HTML解析関連のユーティリティ関数
 */
import * as cheerio from 'cheerio';

/**
 * HTMLを解析してCheerioオブジェクトを返す
 * @param html HTML文字列
 * @returns Cheerioインスタンス
 */
export function parseHTML(html: string): cheerio.CheerioAPI {
	return cheerio.load(html);
}

/**
 * WikipediaのページタイトルからJSONLDデータを抽出
 * @param $ Cheerioインスタンス
 * @returns JSON-LDデータ（見つからない場合はundefined）
 */
export function extractWikipediaJsonLD(
	$: cheerio.CheerioAPI,
): Record<string, unknown> | undefined {
	try {
		const scriptContent = $('script[type="application/ld+json"]').html();
		if (!scriptContent) {
			return undefined;
		}

		return JSON.parse(scriptContent) as Record<string, unknown>;
	} catch (error) {
		console.error('JSON-LD extraction error:', error);
		return undefined;
	}
}

/**
 * テキストを正規化する（空白の削除、特殊文字の変換など）
 * @param text 正規化するテキスト
 * @returns 正規化されたテキスト
 */
export function normalizeText(text: string): string {
	if (!text) {
		return '';
	}

	return text
		.trim()
		.replaceAll(/\s+/g, ' ')
		.replaceAll(/[\u200B-\u200D\uFEFF]/g, ''); // ゼロ幅スペースなどの非表示文字を削除
}

/**
 * 特定のセレクタに一致する要素のテキストを取得して正規化する
 * @param $ Cheerioインスタンス
 * @param selector CSSセレクタ
 * @returns 正規化されたテキスト
 */
export function extractText($: cheerio.CheerioAPI, selector: string): string {
	const element = $(selector);
	if (element.length === 0) {
		return '';
	}

	return normalizeText(element.text());
}

/**
 * 括弧内のサブタイトルや説明を含むタイトルから本タイトルのみを抽出する
 * @param title 処理するタイトル
 * @returns 本タイトル
 */
export function extractMainTitle(title: string): string {
	// 「映画名 (説明)」 形式から映画名のみを抽出
	const match = /^(.+?)\s*[(（].*?[)）]?$/.exec(title);
	return match ? normalizeText(match[1]) : normalizeText(title);
}
