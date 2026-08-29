import {type Environment} from '@shine/database';
import {
  importListPersonAwardEditions,
  type ListPersonAwardEdition,
  type ListPersonAwardEntry,
  type ListPersonAwardFilm,
  type ListPersonAwardPerson,
} from './common/ja-wikipedia-person-award';
import {fetchWikitext} from './common/wikitext';
import {
  cellsOf,
  fillRow,
  type CarriedCell,
  type Cell,
} from './common/wikitext-table';
import {type ImdbEventImportStats} from './imdb-event-award';
import {findJapanPersonAwardSource} from './japan-person-awards';
import {mainichiCeremonyNumber} from './mainichi-film-concours';

export type MainichiNominationArticle = {
  article: string;
  category: string;
};

/** 部門ごとの個別記事。近年はノミネートの表があり、受賞者は背景色で示される */
export const MAINICHI_NOMINATION_ARTICLES: MainichiNominationArticle[] = [
  {article: '毎日映画コンクール男優主演賞', category: '男優主演賞'},
  {article: '毎日映画コンクール女優主演賞', category: '女優主演賞'},
  {article: '毎日映画コンクール男優助演賞', category: '男優助演賞'},
  {article: '毎日映画コンクール女優助演賞', category: '女優助演賞'},
  {article: '毎日映画コンクール主演俳優賞', category: '主演俳優賞'},
  {article: '毎日映画コンクール助演俳優賞', category: '助演俳優賞'},
];

const AWARDS_SECTION = /^==\s*受賞者リスト\s*==\s*$/m;
const NEXT_SECTION = /\n==[^=]/;
const TABLE_START = /^\{\|/m;
const TABLE_END = '\n|}';
const ROW_SEPARATOR = /^\|-/m;
const WINNER_BACKGROUND = '#FAEB86';
const REF_TAG = /<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>/gs;
const WIKI_LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;
const WIKI_LINKS = new RegExp(WIKI_LINK.source, 'g');
const YEAR = /\[\[(\d{4})年の日本公開映画/;
const DISAMBIGUATION = /\s*[（(][^（()）]*[）)]$/;
const YEAR_HEADER = '年';
const PERSON_HEADER = '俳優';
const FILM_HEADER = '作品';
const ROLE_HEADER = '役名';

type ColumnLayout = {
  size: number;
  yearIndex: number;
  personIndex: number;
  filmIndex: number;
};

function columnLayout(header: Cell[]): ColumnLayout | undefined {
  const labels = header.map(cell => cell.content);
  const yearIndex = labels.indexOf(YEAR_HEADER);
  const personIndex = labels.indexOf(PERSON_HEADER);
  const filmIndex = labels.indexOf(FILM_HEADER);
  const hasRole = labels.includes(ROLE_HEADER);

  return yearIndex === -1 || personIndex === -1 || filmIndex === -1 || !hasRole
    ? undefined
    : {size: labels.length, yearIndex, personIndex, filmIndex};
}

function plainText(content: string): string {
  return content.replaceAll("'''", '').trim();
}

function parsePerson(content: string): ListPersonAwardPerson | undefined {
  const link = WIKI_LINK.exec(content);
  if (link) {
    const page = link[1].trim();
    return {name: plainText(link[2] ?? page.replace(DISAMBIGUATION, '')), page};
  }

  const name = plainText(content);
  return name === '' ? undefined : {name};
}

function parseFilms(content: string): ListPersonAwardFilm[] {
  const links = content.matchAll(WIKI_LINKS).toArray();
  if (links.length > 0) {
    return links.map(link => {
      const page = link[1].trim();
      return {page, title: plainText(link[2] ?? page)};
    });
  }

  const title = plainText(content);
  return title === '' ? [] : [{title}];
}

function parseEntry(
  row: Cell[],
  layout: ColumnLayout,
  category: string,
  isWinner: boolean,
): ListPersonAwardEntry | undefined {
  const personCell = row[layout.personIndex];
  const filmCell = row[layout.filmIndex];
  if (!personCell || !filmCell) {
    return undefined;
  }

  const person = parsePerson(personCell.content);
  const films = parseFilms(filmCell.content);
  if (!person || films.length === 0) {
    return undefined;
  }

  return {category, people: [person], films, isWinner};
}

function parseTable(table: string, category: string): ListPersonAwardEdition[] {
  const chunks = table.split(ROW_SEPARATOR);
  const headerIndex = chunks.findIndex(chunk =>
    chunk.split('\n').some(line => line.startsWith('!')),
  );
  if (headerIndex === -1) {
    return [];
  }

  const layout = columnLayout(cellsOf(chunks[headerIndex], ['!']));
  if (!layout) {
    return [];
  }

  const editions: ListPersonAwardEdition[] = [];
  const carried: CarriedCell[] = [];

  const dataChunks = chunks.slice(headerIndex + 1);
  for (const chunk of dataChunks) {
    const own = cellsOf(chunk, ['|']);
    if (own.length === 0) {
      continue;
    }

    const row = fillRow(own, carried, layout.size);
    const year =
      row[layout.yearIndex] && YEAR.exec(row[layout.yearIndex].content);
    if (!year) {
      continue;
    }

    const isWinner = chunk.split('\n', 1)[0].includes(WINNER_BACKGROUND);
    const entry = parseEntry(row, layout, category, isWinner);
    if (!entry) {
      continue;
    }

    const edition = editions.at(-1);
    if (edition?.year === Number(year[1])) {
      edition.entries.push(entry);
      continue;
    }

    const ceremonyNumber = mainichiCeremonyNumber(Number(year[1]));
    if (ceremonyNumber === undefined) {
      continue;
    }

    editions.push({year: Number(year[1]), ceremonyNumber, entries: [entry]});
  }

  return editions;
}

export function parseMainichiNominationWikitext(
  wikitext: string,
  category: string,
): ListPersonAwardEdition[] {
  const afterHeading = wikitext.split(AWARDS_SECTION)[1];
  if (!afterHeading) {
    return [];
  }

  const nextSection = NEXT_SECTION.exec(afterHeading);
  const body = (
    nextSection ? afterHeading.slice(0, nextSection.index) : afterHeading
  ).replaceAll(REF_TAG, '');

  return body
    .split(TABLE_START)
    .slice(1)
    .flatMap(table => parseTable(table.split(TABLE_END)[0], category));
}

function mergeEditions(
  editions: ListPersonAwardEdition[],
): ListPersonAwardEdition[] {
  const byYear = new Map<number, ListPersonAwardEdition>();
  for (const edition of editions) {
    const existing = byYear.get(edition.year);
    if (existing) {
      existing.entries.push(...edition.entries);
    } else {
      byYear.set(edition.year, {...edition, entries: [...edition.entries]});
    }
  }

  return byYear
    .values()
    .toArray()
    .toSorted((a, b) => a.year - b.year);
}

export async function importMainichiPersonNominations({
  environment,
  category,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  /** DBの部門名で1つに絞る */
  category?: string;
  dryRun?: boolean;
  /** 年度（作品の公開年） */
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  const source = findJapanPersonAwardSource('mainichi');
  if (!source) {
    throw new Error('毎日映画コンクールの設定が見つかりません');
  }

  const articles = MAINICHI_NOMINATION_ARTICLES.filter(
    article => category === undefined || article.category === category,
  );

  const editions: ListPersonAwardEdition[] = [];
  for (const article of articles) {
    const wikitext = await fetchWikitext(article.article, {language: 'ja'});
    const parsed = parseMainichiNominationWikitext(
      wikitext,
      article.category,
    ).filter(edition => year === undefined || edition.year === year);
    console.log(
      `\n=== ${article.article}: parsed ${parsed.length} editions from Wikipedia`,
    );
    editions.push(...parsed);
  }

  return importListPersonAwardEditions({
    environment,
    source,
    categories: source.categories.filter(definition =>
      articles.some(article => article.category === definition.category),
    ),
    editions: mergeEditions(editions),
    dryRun,
    year,
    throttleMs,
  });
}
