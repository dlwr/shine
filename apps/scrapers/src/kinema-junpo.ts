import {type Environment} from '@shine/database';
import {
  filmAwardConfig,
  filmAwardReferences,
  importFilmAward,
  splitEditions,
  toFilmAwardEventData,
  type FilmAwardSource,
} from './common/ja-wikipedia-film-award';
import {type FilmReference} from './common/film-resolution-checks';
import {type ResolvedFilm} from './common/wikidata-film-resolver';
import {
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
} from './imdb-event-award';

const JAPANESE_CATEGORY = 'Best Japanese Film';
const FOREIGN_CATEGORY = 'Best Foreign Film';

const JAPANESE_SECTIONS = new Set([
  '日本映画ベスト・テン',
  '日本映画',
  '日本・現代映画',
  '日本・時代映画',
]);

const FOREIGN_SECTIONS = new Set([
  '外国映画ベスト・テン',
  '外国映画',
  '外国・発声映画',
  '外国・無声映画',
  '芸術的に最も優れた映画',
  '娯楽的に最も優れた映画',
  '芸術的優秀映画',
  '娯楽的優秀映画',
]);

const EDITION_HEADING = /^====\s*第(\d+)回（(\d{4})年度）\s*====$/m;
const SECTION_HEADING = /^'''(.+?)'''\s*$/m;
const WIKI_LINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/;
const LINE_BREAK = /<br\s*\/?>/;
const EMPTY_RANK = new Set(['-', '－', '―']);

type KinemaJunpoFilm = {
  rank: number;
  page?: string;
  title: string;
};

export type KinemaJunpoEdition = {
  year: number;
  japanese: KinemaJunpoFilm[];
  foreign: KinemaJunpoFilm[];
};

// 1924年度から毎年。戦争で1943〜1945年度は中止され、1946年度の第20回で再開した
export function kinemaJunpoCeremonyNumber(year: number): number | undefined {
  if (year < 1924 || (year >= 1943 && year <= 1945)) {
    return undefined;
  }

  return year - (year <= 1942 ? 1923 : 1926);
}

function parseEntry(rank: number, entry: string): KinemaJunpoFilm[] {
  const films: KinemaJunpoFilm[] = [];

  for (const fragment of entry.split(LINE_BREAK)) {
    const text = fragment.trim();
    if (text === '') {
      continue;
    }

    const link = WIKI_LINK.exec(text);
    if (link) {
      const page = link[1].trim();
      films.push({rank, page, title: (link[2] ?? page).trim()});
      continue;
    }

    const title = text.replace(/（.*$/, '').trim();
    if (title !== '') {
      films.push({rank, title});
    }
  }

  return films;
}

function parseFilmLines(content: string): KinemaJunpoFilm[] {
  const films: KinemaJunpoFilm[] = [];
  let rank = 0;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#')) {
      continue;
    }

    rank++;
    const entry = trimmed.slice(1).trim();
    if (entry === '' || EMPTY_RANK.has(entry)) {
      continue;
    }

    films.push(...parseEntry(rank, entry));
  }

  return films;
}

export function parseKinemaJunpoWikitext(
  wikitext: string,
): KinemaJunpoEdition[] {
  return splitEditions(wikitext, EDITION_HEADING).map(({year, body}) => {
    const blocks = body.split(new RegExp(SECTION_HEADING.source, 'gm'));
    const edition: KinemaJunpoEdition = {year, japanese: [], foreign: []};

    for (let block = 1; block < blocks.length; block += 2) {
      const heading = blocks[block];
      const films = parseFilmLines(blocks[block + 1]);

      if (JAPANESE_SECTIONS.has(heading)) {
        edition.japanese.push(...films);
      } else if (FOREIGN_SECTIONS.has(heading)) {
        edition.foreign.push(...films);
      }
    }

    return edition;
  });
}

function rankedNomination(film: KinemaJunpoFilm): {
  isWinner: boolean;
  notes: string;
} {
  return {isWinner: film.rank === 1, notes: `${film.rank}位`};
}

export const kinemaJunpoSource: FilmAwardSource<
  KinemaJunpoEdition,
  KinemaJunpoFilm
> = {
  article: 'キネマ旬報',
  organizationName: 'Kinema Junpo',
  establishedYear: 1924,
  ceremonyNumber: kinemaJunpoCeremonyNumber,
  categories: [
    {
      category: JAPANESE_CATEGORY,
      films: edition => edition.japanese,
      nomination: rankedNomination,
    },
    {
      category: FOREIGN_CATEGORY,
      films: edition => edition.foreign,
      foreign: true,
      nomination: rankedNomination,
    },
  ],
  /** 連作の共有記事や、ja.wikipedia の記事が Wikidata の映画実体に繋がらない作品 */
  resolutionOverrides: new Map([
    ['1925:嘆きのピエロ', 'tt0014256'],
    ['1927:忠次旅日記 信州血笑篇', 'tt0432794'],
    ['1927:忠次旅日記 御用篇', 'tt0342196'],
    ['1927:ボー・ジェスト', 'tt0016634'],
    ['1927:チャング', 'tt0017743'],
    ['1927:帝国ホテル', 'tt0018014'],
    ['1927:椿姫', 'tt0017731'],
    ['1927:カルメン', 'tt0016709'],
    ['1935:最後の億万長者', 'tt0025043'],
    ['1935:ロスチャイルド', 'tt0025272'],
    ['1935:生きているモレア', 'tt0026970'],
    ['1935:情熱なき犯罪', 'tt0025009'],
  ]),
  useNotesAsSpecialMention: true,
  keepDuplicateResolutions: true,
};

export const kinemaJunpoJapaneseConfig: ImdbEventAwardConfig = filmAwardConfig(
  kinemaJunpoSource,
  JAPANESE_CATEGORY,
);

export function kinemaJunpoFilmReferences(
  editions: KinemaJunpoEdition[],
): FilmReference[] {
  return filmAwardReferences(kinemaJunpoSource, editions);
}

export function toImdbEventData(
  editions: KinemaJunpoEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt?: string,
): ImdbEventCollectedData {
  return toFilmAwardEventData(
    kinemaJunpoSource,
    editions,
    resolved,
    collectedAt,
  );
}

export async function importKinemaJunpo(options: {
  environment: Environment;
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<Record<string, ImdbEventImportStats>> {
  return importFilmAward({
    source: kinemaJunpoSource,
    parse: parseKinemaJunpoWikitext,
    ...options,
  });
}
