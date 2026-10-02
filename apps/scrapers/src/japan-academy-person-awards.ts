import {type Environment} from '@shine/database';
import {
  importListPersonAwardEditions,
  type ListPersonAwardSource,
} from './common/ja-wikipedia-person-award';
import {fetchWikitext} from './common/wikitext';
import {type ImdbEventImportStats} from './imdb-event-award';
import {addImportStats, emptyImportStats} from './imdb-event-award/stats';
import {japanAcademyCeremonyNumber} from './japan-academy-awards';
import {parseJapanAcademyPersonWikitext} from './japan-academy-person-wikitext';

/**
 * 記事名からIMDb IDを引けない作品を直接指す。
 * TMDbの邦題と表記が違うもの（全角記号・中黒・字体）が大半
 */
const RESOLUTION_OVERRIDES = new Map([
  ['1980:わるいやつら', 'tt0211743'],
  ['1985:夢千代日記', 'tt0320784'],
  ['1994:家なき子', 'tt0183174'],
  ['2017:ミックス。', 'tt4265596'],
  ['2020:コンフィデンスマンJP プリンセス編', 'tt12767996'],
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

export function japanAcademyPersonSource(
  award: JapanAcademyPersonAward,
): ListPersonAwardSource {
  return {
    key: award.category,
    article: award.article,
    organizationName: 'Japan Academy Awards',
    establishedYear: 1978,
    ceremonyNumber: japanAcademyCeremonyNumber,
    ceremonyYearOffset: 1,
    categories: [
      {names: [award.category], category: award.category, role: award.role},
    ],
    resolutionOverrides: RESOLUTION_OVERRIDES,
    personNameAliases: PERSON_NAME_ALIASES,
  };
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
  /** 授賞式の年。1978年が第1回 */
  year?: number;
  throttleMs?: number;
}): Promise<ImdbEventImportStats> {
  const total = emptyImportStats();

  for (const award of awards) {
    const source = japanAcademyPersonSource(award);
    const editions = parseJapanAcademyPersonWikitext(
      await fetchWikitext(award.article, {language: 'ja'}),
      award.category,
    ).filter(edition => year === undefined || edition.year + 1 === year);
    console.log(
      `\n=== ${award.category}: parsed ${editions.length} editions from Wikipedia`,
    );

    const stats = await importListPersonAwardEditions({
      environment,
      source,
      editions,
      dryRun,
      year,
      throttleMs,
    });

    addImportStats(total, stats);
  }

  return total;
}
