import {buildUrl, fetchJsonWithRetry} from './fetch-utilities';
import {type WikipediaLanguage} from './wikidata-film-resolver';

const USER_AGENT = 'shine-film.com movie database (https://shine-film.com)';

type WikitextResponse = {parse?: {wikitext?: {'*'?: string}}};

export async function fetchWikitext(
  article: string,
  {language}: {language: WikipediaLanguage},
): Promise<string> {
  const url = buildUrl(`https://${language}.wikipedia.org/w/api.php`, {
    action: 'parse',
    page: article,
    prop: 'wikitext',
    format: 'json',
  });

  const response = await fetchJsonWithRetry<WikitextResponse>(url, {
    headers: {'User-Agent': USER_AGENT},
  });

  const wikitext = response.parse?.wikitext?.['*'];
  if (!wikitext) {
    throw new Error(`${article}の記事を取得できませんでした`);
  }

  return wikitext;
}
