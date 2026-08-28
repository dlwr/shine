import {type Environment} from '@shine/database';
import {
  filmReferenceKey,
  resolveFilmReferences,
} from './common/film-reference-resolver';
import {
  type FilmReference,
  type ResolvedFilm,
  type YearWindow,
} from './common/wikidata-film-resolver';
import {
  importImdbEventAward,
  type ImdbEventAwardConfig,
  type ImdbEventCollectedData,
  type ImdbEventImportStats,
  type ImdbEventNomination,
} from './imdb-event-award';
import {japanAcademyCeremonyNumber} from './japan-academy-awards';
import {
  fetchJapanAcademyPersonWikitext,
  parseJapanAcademyPersonWikitext,
  type JapanAcademyPersonEdition,
  type JapanAcademyPersonEntry,
} from './japan-academy-person-wikitext';

/**
 * 記事名からIMDb IDを引けない作品を直接指す。
 * TMDbの邦題と表記が違うもの（全角記号・中黒・字体）が大半
 */
const RESOLUTION_OVERRIDES = new Map([
  ['1978:好色五人女', 'tt0287632'],
  ['1978:曾根崎心中', 'tt0077463'],
  ['1978:薔薇の肉体', 'tt0287394'],
  ['1981:魔性の夏', 'tt0226121'],
  ['1988:優駿', 'tt0204068'],
  ['1989:舞姫', 'tt0097151'],
  ['1991:新極道の妻たち', 'tt0226439'],
  ['1993:新極道の妻たち 覚悟しいや', 'tt0226440'],
  ['1993:眠らない街〜新宿鮫〜', 'tt0256956'],
  ['1996:お日柄もよくご愁傷さま', 'tt0349902'],
  ['2002:OUT', 'tt0340280'],
  ['2005:蟬しぐれ', 'tt0455748'],
  ['2011:八日目の蝉', 'tt1727825'],
  ['2014:WOOD JOB!〜神去なあなあ日常〜', 'tt2964120'],
  ['2016:ちはやふる -上の句-', 'tt4785440'],
  ['2019:決算!忠臣蔵', 'tt10315082'],
  ['2019:閉鎖病棟 -それぞれの朝-', 'tt9721798'],
  ['2021:老後の資金がありません!', 'tt11354164'],
  ['2024:カラオケ行こ!', 'tt27957457'],
]);

/**
 * 記事の表記とTMDbのクレジット名が別名で、表記の正規化では寄らないもの。
 * 芸名を使い分けている人だけを入れる
 */
const PERSON_NAME_ALIASES: Record<string, string> = {
  北野武: 'ビートたけし',
  夏木勲: '夏八木勲',
  // 襲名でクレジット名が変わったもの
  市川海老蔵: '十三代目 市川團十郎',
  市川染五郎: '十代目 松本幸四郎',
  瑛太: '永山瑛太',
};

/** 対象期間は前年12月16日〜当年12月15日。映画祭プレミアで前年公開になることはある */
const PUBLICATION_WINDOW: YearWindow = {min: -1, max: 1};

export type JapanAcademyPersonAward = {
  article: string;
  category: string;
  role: 'director' | 'actor';
};

export const JAPAN_ACADEMY_PERSON_AWARDS: JapanAcademyPersonAward[] = [
  {article: '日本アカデミー賞監督賞', category: '監督賞', role: 'director'},
  {
    article: '日本アカデミー賞主演男優賞',
    category: '主演男優賞',
    role: 'actor',
  },
  {
    article: '日本アカデミー賞主演女優賞',
    category: '主演女優賞',
    role: 'actor',
  },
  {
    article: '日本アカデミー賞助演男優賞',
    category: '助演男優賞',
    role: 'actor',
  },
  {
    article: '日本アカデミー賞助演女優賞',
    category: '助演女優賞',
    role: 'actor',
  },
];

export function japanAcademyPersonFilmReferences(
  editions: JapanAcademyPersonEdition[],
): FilmReference[] {
  const references = new Map<string, FilmReference>();

  for (const edition of editions) {
    for (const entry of edition.entries) {
      addReference(references, edition, entry);
    }
  }

  return references.values().toArray();
}

function addReference(
  references: Map<string, FilmReference>,
  edition: JapanAcademyPersonEdition,
  entry: JapanAcademyPersonEntry,
): void {
  const key = referenceKey(edition, entry);
  if (references.has(key) || overrideImdbId(edition, entry) !== undefined) {
    return;
  }

  references.set(key, {
    key,
    title: entry.filmTitle,
    targetYear: edition.year,
    yearWindow: PUBLICATION_WINDOW,
    foreign: false,
  });
}

function referenceKey(
  edition: JapanAcademyPersonEdition,
  entry: JapanAcademyPersonEntry,
): string {
  return filmReferenceKey(
    {page: entry.filmPage, title: entry.filmTitle},
    edition.year,
  );
}

function overrideImdbId(
  edition: JapanAcademyPersonEdition,
  entry: JapanAcademyPersonEntry,
): string | undefined {
  return RESOLUTION_OVERRIDES.get(`${edition.year}:${entry.filmTitle}`);
}

export function toImdbEventData(
  award: JapanAcademyPersonAward,
  editions: JapanAcademyPersonEdition[],
  resolved: Map<string, ResolvedFilm>,
  collectedAt = new Date().toISOString().slice(0, 10),
): ImdbEventCollectedData {
  return {
    collectedAt,
    source: `https://ja.wikipedia.org/wiki/${award.article}`,
    editions: editions.map(edition => ({
      year: edition.year + 1,
      awardNames: [award.category],
      targetAward: [
        {
          categories: [
            {
              category: award.category,
              total: null, // eslint-disable-line unicorn/no-null -- ImdbEventEditionの型に合わせる
              nominations: buildNominations(edition, resolved),
            },
          ],
        },
      ],
    })),
  };
}

function buildNominations(
  edition: JapanAcademyPersonEdition,
  resolved: Map<string, ResolvedFilm>,
): ImdbEventNomination[] {
  const nominations: ImdbEventNomination[] = [];

  for (const entry of edition.entries) {
    const imdbId = overrideImdbId(edition, entry);
    const match: ResolvedFilm | undefined =
      imdbId === undefined
        ? resolved.get(referenceKey(edition, entry))
        : {imdbId};
    if (!match) {
      console.log(`Unresolved: ${edition.year} ${entry.filmTitle}`);
      continue;
    }

    nominations.push({
      isWinner: entry.isWinner,
      notes: null, // eslint-disable-line unicorn/no-null -- ImdbEventNominationの型に合わせる
      titles: [
        {
          imdbId: match.imdbId,
          title: entry.filmTitle,
          originalTitle: match.englishTitle ?? null, // eslint-disable-line unicorn/no-null -- ImdbEventNominationTitleの型に合わせる
        },
      ],
      people: [
        {name: PERSON_NAME_ALIASES[entry.personName] ?? entry.personName},
      ],
    });
  }

  return nominations;
}

export function japanAcademyPersonConfig(
  award: JapanAcademyPersonAward,
): ImdbEventAwardConfig {
  return {
    organizationName: 'Japan Academy Awards',
    organizationCountry: 'Japan',
    establishedYear: 1978,
    categoryName: award.category,
    ceremonyNumber: japanAcademyCeremonyNumber,
    isCompetitionCategory: category => category === award.category,
    minimumFilmsPerEdition: 1,
    personRole: award.role,
  };
}

export async function importJapanAcademyPersonAward({
  environment,
  award,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  award: JapanAcademyPersonAward;
  dryRun?: boolean;
  /** 授賞式の年。1978年が第1回 */
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  const allEditions = parseJapanAcademyPersonWikitext(
    await fetchJapanAcademyPersonWikitext(award.article),
  );
  const editions =
    year === undefined
      ? allEditions
      : allEditions.filter(edition => edition.year + 1 === year);

  console.log(
    `\n=== ${award.category}: parsed ${editions.length} editions from Wikipedia`,
  );

  const resolved = await resolveFilmReferences({
    references: japanAcademyPersonFilmReferences(editions),
    tmdbApiKey: environment.TMDB_API_KEY,
    throttleMs,
  });

  return importImdbEventAward({
    environment,
    data: toImdbEventData(award, editions, resolved),
    config: japanAcademyPersonConfig(award),
    dryRun,
    year,
    throttleMs,
  });
}

export async function importJapanAcademyPersonAwards({
  environment,
  awards = JAPAN_ACADEMY_PERSON_AWARDS,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  awards?: JapanAcademyPersonAward[];
  dryRun?: boolean;
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  const total: ImdbEventImportStats = {
    editionsProcessed: 0,
    moviesCreated: 0,
    moviesExisting: 0,
    skippedSoftDeleted: 0,
    nominationsCreated: 0,
    winnersUpdated: 0,
    tmdbNotFound: 0,
    peopleUnresolved: 0,
    failed: 0,
  };

  for (const award of awards) {
    const stats = await importJapanAcademyPersonAward({
      environment,
      award,
      dryRun,
      year,
      throttleMs,
    });

    for (const key of Object.keys(total) as Array<keyof ImdbEventImportStats>) {
      total[key] += stats[key];
    }
  }

  return total;
}
