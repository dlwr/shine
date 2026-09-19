import {splitEditions} from './ja-wikipedia-film-award-wikitext';

export type ListPersonAwardCategory = {
  /** 記事での部門名。改称があれば全て並べる */
  names: string[];
  /** DBに保存する部門名 */
  category: string;
  role: 'director' | 'actor';
  /** 同じ部門名を年によって別部門に振るときの対象年度 */
  years?: number[];
  /** 外国映画が対象の部門。日本公開が本国より遅れるので同定の年の窓を広げる */
  foreign?: boolean;
};

export type ListPersonAwardPerson = {
  name: string;
  page?: string;
};

export type ListPersonAwardFilm = {
  page?: string;
  title: string;
};

export type ListPersonAwardEntry = {
  category: string;
  people: ListPersonAwardPerson[];
  films: ListPersonAwardFilm[];
  /** 候補だけの行は false。受賞者しか並ばない記事では省略する */
  isWinner?: boolean;
};

export type ListPersonAwardEdition = {
  year: number;
  ceremonyNumber: number;
  entries: ListPersonAwardEntry[];
};

type Group = Omit<ListPersonAwardEntry, 'category'>;

const EDITION_HEADING =
  /^====\s*(?:\[\[[^\]|]+\|)?第(\d+)回（(\d{4})年度?）(?:]])?\s*====\s*$/m;
const AWARD_LINE = /^:?(\*+)\s*([^『\s（]+)\s*(.*)$/;
const SUB_ITEM = /^:?(\*+)\s*(.*)$/;
const REF_TAG = /<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>|\{\{R\|[^}]*}}/g;
// 節名に『』を含むリンク（[[学校の怪談 (映画)#『学校の怪談2』|…]]）があるので、『』付きリンクを先に読む
const TOKEN =
  /『\s*\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]\s*』|\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]|『([^』]*)』/g;
const WIKI_LINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;
const INTERWIKI_TEMPLATE = /^\{\{仮リンク\|([^|}]+)/;
const QUOTED_LINK = /『\s*\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]\s*』/g;
const NAME_SEPARATOR = /[、,]/;
const NAME_TRIM = /^[\s（）()：:・]+|[\s（）()：:・]+$/g;
const DISAMBIGUATION = /\s*\([^)]*\)$/;
const NOT_A_NAME = new Set(['ほか', 'など', '他', '等', 'その他']);
const NO_WINNER = '該当者なし';

// 記事は既出の映画を再リンクしないので、同じ回の『』内リンクから記事名を補う
function collectTitlePages(body: string): Map<string, string> {
  const pages = new Map<string, string>();

  for (const link of body.matchAll(QUOTED_LINK)) {
    const page = link[1].trim();
    const title = (link[2] ?? page).trim();
    if (!pages.has(title)) {
      pages.set(title, page);
    }
  }

  return pages;
}

function parseFilm(
  inner: string,
  titlePages: Map<string, string>,
): ListPersonAwardFilm | undefined {
  const content = inner.trim();
  if (content === '') {
    return undefined;
  }

  const link = WIKI_LINK.exec(content);
  if (link) {
    const page = link[1].trim();
    return {page, title: (link[2] ?? page).trim()};
  }

  const template = INTERWIKI_TEMPLATE.exec(content);
  if (template) {
    return {title: template[1].trim()};
  }

  const page = titlePages.get(content);
  return page === undefined ? {title: content} : {page, title: content};
}

function bareNames(text: string): ListPersonAwardPerson[] {
  return text
    .split(NAME_SEPARATOR)
    .map(part => part.replaceAll(NAME_TRIM, ''))
    .filter(
      name => name !== '' && !NOT_A_NAME.has(name) && !/[『』]/.test(name),
    )
    .map(name => ({name}));
}

function linkedPerson(
  page: string,
  label: string | undefined,
): ListPersonAwardPerson {
  return {
    name: (label ?? page.replace(DISAMBIGUATION, '')).trim(),
    page: page.trim(),
  };
}

function parseGroups(text: string, titlePages: Map<string, string>): Group[] {
  const groups: Group[] = [];
  let current: Group | undefined;
  let cursor = 0;

  const addPeople = (people: ListPersonAwardPerson[]) => {
    if (people.length === 0) {
      return;
    }

    if (!current || current.films.length > 0) {
      current = {people: [...people], films: []};
      groups.push(current);
    } else {
      current.people.push(...people);
    }
  };

  for (const token of text.matchAll(TOKEN)) {
    const [, quotedPage, quotedLabel, linkPage, linkLabel, titleInner] = token;
    const between = text.slice(cursor, token.index);
    cursor = token.index + token[0].length;
    addPeople(bareNames(between));

    if (linkPage !== undefined) {
      addPeople([linkedPerson(linkPage, linkLabel)]);
      continue;
    }

    const film =
      quotedPage === undefined
        ? parseFilm(titleInner, titlePages)
        : {page: quotedPage.trim(), title: (quotedLabel ?? quotedPage).trim()};
    if (film && current) {
      current.films.push(film);
    }
  }

  return groups.filter(group => group.films.length > 0);
}

function findCategory(
  categories: ListPersonAwardCategory[],
  name: string,
  year: number,
): ListPersonAwardCategory | undefined {
  return categories.find(
    category =>
      category.names.includes(name) &&
      (category.years === undefined || category.years.includes(year)),
  );
}

function parseEditionBody(
  year: number,
  body: string,
  categories: ListPersonAwardCategory[],
): ListPersonAwardEntry[] {
  const entries: ListPersonAwardEntry[] = [];
  const titlePages = collectTitlePages(body);
  const lines = body
    .split('\n')
    .map(line => line.replaceAll(REF_TAG, '').trim());

  for (const [index, line] of lines.entries()) {
    const matched = AWARD_LINE.exec(line);
    if (!matched) {
      continue;
    }

    const [, marker, name, rest] = matched;
    const definition = findCategory(categories, name, year);
    if (!definition || rest.includes(NO_WINNER)) {
      continue;
    }

    const texts = rest === '' ? subItems(lines, index, marker.length) : [rest];
    for (const text of texts) {
      for (const group of parseGroups(text, titlePages)) {
        entries.push({category: definition.category, ...group});
      }
    }
  }

  return entries;
}

function subItems(lines: string[], index: number, depth: number): string[] {
  const texts: string[] = [];

  const following = lines.slice(index + 1);
  for (const line of following) {
    const matched = SUB_ITEM.exec(line);
    if (!matched || matched[1].length <= depth) {
      break;
    }

    texts.push(matched[2]);
  }

  return texts;
}

export function parseListPersonAwardWikitext(
  wikitext: string,
  categories: ListPersonAwardCategory[],
): ListPersonAwardEdition[] {
  return splitEditions(wikitext, EDITION_HEADING).map(
    ({ceremonyNumber, year, body}) => ({
      year,
      ceremonyNumber,
      entries: parseEditionBody(year, body, categories),
    }),
  );
}
