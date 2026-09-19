export type WikiFilm = {
  page?: string;
  title: string;
};

const HIGHER_HEADING = /^={2,3}[^=]/m;
const AWARD_LINE = /^\*(?!\*)\s*([^『\s]+)\s*(.*)$/;
// 出典のタイトルに『映画名』が入ることがある
const REF_TAG = /<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>/g;
const TEMPLATE = /{{[^}]*}}/g;
const BRACKETED_TITLE = /『([^』]*)』/g;
const WIKI_LINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;

export type EditionSection = {
  ceremonyNumber: number;
  year: number;
  body: string;
};

/** 見出しは (回次, 年) の2つのグループを持つこと */
export function splitEditions(
  wikitext: string,
  editionHeading: RegExp,
): EditionSection[] {
  const parts = wikitext.split(new RegExp(editionHeading.source, 'gm'));
  const editions: EditionSection[] = [];

  for (let index = 1; index < parts.length; index += 3) {
    editions.push({
      ceremonyNumber: Number(parts[index]),
      year: Number(parts[index + 1]),
      body: parts[index + 2].split(HIGHER_HEADING)[0],
    });
  }

  return editions;
}

function parseFilm(content: string): WikiFilm {
  const link = WIKI_LINK.exec(content);
  if (link) {
    const page = link[1].trim();
    return {page, title: (link[2] ?? page).trim()};
  }

  return {title: content.replaceAll(TEMPLATE, '').trim()};
}

export function parseBracketedFilms(text: string): WikiFilm[] {
  const films: WikiFilm[] = [];

  for (const [, inner] of text.matchAll(BRACKETED_TITLE)) {
    const content = inner.trim();
    if (content === '') {
      continue;
    }

    films.push(parseFilm(content));
  }

  if (films.length === 0 && WIKI_LINK.test(text)) {
    films.push(parseFilm(text));
  }

  return films;
}

/** `*賞名 『作品』` の行を賞名で振り分けて作品を集める */
export function collectAwardLineFilms(
  body: string,
  target: (name: string) => WikiFilm[] | undefined,
): void {
  for (const line of body.split('\n')) {
    const matched = AWARD_LINE.exec(line.replaceAll(REF_TAG, '').trim());
    if (!matched) {
      continue;
    }

    const [, name, rest] = matched;
    target(name)?.push(...parseBracketedFilms(rest));
  }
}

/** 記事が無い作品はWikipediaの表示名で引けるようにする */
export function filmKey(film: WikiFilm): string {
  return film.page ?? `title:${film.title}`;
}
