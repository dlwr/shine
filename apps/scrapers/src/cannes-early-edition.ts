import {filmOf, type FilmAwardEntry} from './common/award-table-wikitext';

/** 1946・1947・1949年の記事にしか無い見出し。以後の回は表になる */
const COMPETITION_HEADING =
  /^==\s*(?:Competition|Films in competition|Feature film competition)\s*==/m;
const AWARDS_HEADING = /^==\s*Awards\s*==/m;
const NEXT_HEADING = /\n==[^=]/;
/** 受賞の節は長編と短編を太字で分ける */
const FEATURE_FILMS_GROUP = /^'''Feature Films'''/m;
const NEXT_GROUP = /\n'''/;
const TOP_LEVEL_ITEM = /\n(?=\*(?!\*))/;
const PALME_LINK = /\[\[Palme d'Or(?:\|[^\]]*)?]]/;
/** 1947年は部門ごとにグランプリを出したのでパルム・ドールへのリンクが無い */
const GENRE_GRAND_PRIX = /\(''Grand Prix\b/;
const AWARD_LABEL = /^\*+\s*([^:]+):/;
const ITALIC = "''";

export type EarlyEditionEntry = FilmAwardEntry & {notes?: string};

function sectionBody(wikitext: string, heading: RegExp): string | undefined {
  const match = heading.exec(wikitext);
  if (!match) {
    return undefined;
  }

  const body = wikitext.slice(match.index + match[0].length);
  const next = NEXT_HEADING.exec(body);

  return next ? body.slice(0, next.index) : body;
}

function featureFilmAwards(wikitext: string): string {
  const awards = sectionBody(wikitext, AWARDS_HEADING);
  if (!awards) {
    return '';
  }

  const group = FEATURE_FILMS_GROUP.exec(awards);
  if (!group) {
    return '';
  }

  const body = awards.slice(group.index + group[0].length);
  const next = NEXT_GROUP.exec(body);

  return next ? body.slice(0, next.index) : body;
}

function listItems(body: string): string[] {
  return body.split(TOP_LEVEL_ITEM).filter(item => item.startsWith('*'));
}

/** 箇条書きは「賞名: ''[[記事名|題名]]'' by 監督」の形。賞名側のリンクを拾わないよう題名から読む */
function filmOfItem(text: string): FilmAwardEntry | undefined {
  const title = text.indexOf(ITALIC);
  if (title === -1) {
    return undefined;
  }

  const film = filmOf({
    attributes: '',
    content: text.slice(title),
    rowspan: 1,
    colspan: 1,
  });

  return film && {...film, isWinner: false};
}

function competitionEntries(wikitext: string): EarlyEditionEntry[] {
  const body = sectionBody(wikitext, COMPETITION_HEADING);
  if (!body) {
    return [];
  }

  return listItems(body)
    .map(item => filmOfItem(item))
    .filter(entry => entry !== undefined);
}

function winnerEntries(wikitext: string): EarlyEditionEntry[] {
  const entries: EarlyEditionEntry[] = [];
  const items = listItems(featureFilmAwards(wikitext));

  for (const item of items) {
    const [head] = item.split('\n', 1);

    if (PALME_LINK.test(head)) {
      for (const line of item.split('\n')) {
        const film = filmOfItem(line);
        if (film) {
          entries.push({...film, isWinner: true});
        }
      }

      continue;
    }

    if (!GENRE_GRAND_PRIX.test(item)) {
      continue;
    }

    const film = filmOfItem(item);
    if (film) {
      entries.push({
        ...film,
        isWinner: true,
        notes: AWARD_LABEL.exec(head)?.[1].trim(),
      });
    }
  }

  return entries;
}

/**
 * 表になる前の1946・1947・1949年の記事を読む。出品作はコンペティション部門の箇条書き、
 * 受賞作は Awards 節の長編部門に載る。受賞作を先に並べるので、記事名の揺れで
 * 同じ作品が二重になっても受賞と部門名が残る
 */
export function parseEarlyEditionEntries(
  wikitext: string,
): EarlyEditionEntry[] {
  const entries: EarlyEditionEntry[] = [];
  const seen = new Set<string>();

  for (const entry of [
    ...winnerEntries(wikitext),
    ...competitionEntries(wikitext),
  ]) {
    const key = entry.filmPage ?? entry.filmTitle;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    entries.push(entry);
  }

  return entries;
}
