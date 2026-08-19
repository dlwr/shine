import {buildUrl, fetchJsonWithRetry} from './common/fetch-utilities';

const WIKIPEDIA_API = 'https://ja.wikipedia.org/w/api.php';
const WIKIPEDIA_ARTICLE = '日本アカデミー賞作品賞';
export const SOURCE_URL =
  'https://ja.wikipedia.org/wiki/日本アカデミー賞作品賞';
const USER_AGENT = 'shine-film.com movie database (https://shine-film.com)';

type WikitextResponse = {parse?: {wikitext?: {'*'?: string}}};

export async function fetchJapanAcademyWikitext(): Promise<string> {
  const url = buildUrl(WIKIPEDIA_API, {
    action: 'parse',
    page: WIKIPEDIA_ARTICLE,
    prop: 'wikitext',
    format: 'json',
  });

  const response = await fetchJsonWithRetry<WikitextResponse>(url, {
    headers: {'User-Agent': USER_AGENT},
  });

  const wikitext = response.parse?.wikitext?.['*'];
  if (!wikitext) {
    throw new Error('日本アカデミー賞作品賞の記事を取得できませんでした');
  }

  return wikitext;
}

export type JapanAcademyFilm = {
  page: string;
  title: string;
  isWinner: boolean;
};

export type JapanAcademyEdition = {
  /** 対象作品の公開年。授賞式はこの翌年 */
  year: number;
  ceremonyNumber: number;
  films: JapanAcademyFilm[];
};

const AWARDS_SECTION = '== 受賞作品の一覧 ==';
const RECORDS_SECTION = '== 記録 ==';
const TABLE_START = /^\{\|/m;
const TABLE_END = '\n|}';
const CAPTION = /\{\{big\|\[\[(\d{4})年の映画\|\d{4}年]]}}\[\[第(\d+)回/;
const ROW_SEPARATOR = /^\|-/m;
const WINNER_BACKGROUND = 'background:#FAEB86';
const WIKI_LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;

function parseFilmCell(cell: string): JapanAcademyFilm | undefined {
  const link = WIKI_LINK.exec(cell);
  if (!link) {
    return undefined;
  }

  const page = link[1].trim();
  const title = (link[2] ?? link[1]).trim();

  return page && title ? {page, title, isWinner: false} : undefined;
}

function parseEditionTable(table: string): JapanAcademyEdition | undefined {
  const caption = CAPTION.exec(table);
  if (!caption) {
    return undefined;
  }

  const films: JapanAcademyFilm[] = [];

  for (const row of table.split(ROW_SEPARATOR).slice(1)) {
    const [header, ...lines] = row.split('\n');
    const cell = lines.find(
      line => line.startsWith('|') && !line.startsWith('|+'),
    );
    if (!cell) {
      continue;
    }

    const film = parseFilmCell(cell);
    if (film) {
      films.push({...film, isWinner: header.includes(WINNER_BACKGROUND)});
    }
  }

  return {
    year: Number(caption[1]),
    ceremonyNumber: Number(caption[2]),
    films,
  };
}

export function parseJapanAcademyWikitext(
  wikitext: string,
): JapanAcademyEdition[] {
  const afterHeading = wikitext.split(AWARDS_SECTION)[1];
  if (!afterHeading) {
    return [];
  }

  const body = afterHeading.split(RECORDS_SECTION)[0];

  return body
    .split(TABLE_START)
    .slice(1)
    .map(table => parseEditionTable(table.split(TABLE_END)[0]))
    .filter((edition): edition is JapanAcademyEdition => edition !== undefined);
}
