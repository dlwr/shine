import {type AwardEdition, type FilmAwardEntry} from './award-table-types';
import {type Cell} from './wikitext-table';

const WIKI_LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;
const WIKI_LINKS = new RegExp(WIKI_LINK.source, 'g');
const NOT_AWARDED = /^(?:no award|not awarded)/i;
const REFERENCE = /<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g;
const HTML_NOTE = /<small>[\s\S]*?<\/small>/g;
const HTML_TAG = /<[^>]+>/g;
const NAME_SEPARATOR = /\s+(?:&|and)\s+|,\s+(?!(?:Jr|Sr)\.?(?:\s|$))/;
const NAMED_PARAMETER = /^\s*\w+=/;

function closingBraces(text: string, start: number): number {
  let depth = 0;
  for (let index = start; index < text.length - 1; index++) {
    if (text.startsWith('{{', index)) {
      depth++;
      index++;
    } else if (text.startsWith('}}', index)) {
      depth--;
      if (depth === 0) {
        return index;
      }

      index++;
    }
  }

  return -1;
}

/** {{sort|key|content}} と {{lang|code|content}} は content に、{{sortname|first|last}} は姓名に開き、それ以外のテンプレートは捨てる */
function stripTemplates(text: string): string {
  let result = '';
  let cursor = 0;

  while (cursor < text.length) {
    const open = text.indexOf('{{', cursor);
    if (open === -1) {
      result += text.slice(cursor);
      break;
    }

    const close = closingBraces(text, open);
    if (close === -1) {
      result += text.slice(cursor);
      break;
    }

    result += text.slice(cursor, open);
    const inner = text.slice(open + 2, close);
    const [name, ...parameters] = inner.split('|');
    const templateName = name.trim().toLowerCase();
    const positional = parameters.filter(part => !NAMED_PARAMETER.test(part));
    if (templateName === 'sortname') {
      result += positional
        .slice(0, 2)
        .map(part => part.trim())
        .join(' ');
    } else if (
      (templateName === 'sort' || templateName === 'lang') &&
      positional.length > 1
    ) {
      result += stripTemplates(positional.slice(1).join('|'));
    }

    cursor = close + 2;
  }

  return result;
}

function cleanContent(content: string): string {
  return stripTemplates(
    content.replaceAll(REFERENCE, '').replaceAll(HTML_NOTE, ''),
  )
    .replaceAll(HTML_TAG, '')
    .replaceAll("'''", '')
    .replaceAll("''", '')
    .replaceAll(/[†‡]/gu, '')
    .trim();
}

export function personNames(cell: Cell): string[] {
  const text = cleanContent(cell.content).replaceAll(
    WIKI_LINKS,
    (_, page: string, display?: string) => display ?? page,
  );

  return text
    .split(NAME_SEPARATOR)
    .map(name => name.trim())
    .filter(name => name.length > 0);
}

export function filmOf(
  cell: Cell,
  edition?: AwardEdition<FilmAwardEntry>,
): {filmPage: string | undefined; filmTitle: string} | undefined {
  const cleaned = cleanContent(cell.content);
  const link = WIKI_LINK.exec(cleaned);
  if (link) {
    return {
      filmPage: link[1].trim(),
      filmTitle: (link[2] ?? link[1]).trim(),
    };
  }

  const filmTitle = cleaned.trim();
  if (!filmTitle || NOT_AWARDED.test(filmTitle)) {
    return undefined;
  }

  const known = edition?.entries.find(entry => entry.filmTitle === filmTitle);
  return {filmPage: known?.filmPage, filmTitle};
}
