import {type Environment} from '@shine/database';
import {blueRibbonCeremonyNumber} from './blue-ribbon-awards';
import {
  importListPersonAward,
  type ListPersonAwardCategory,
  type ListPersonAwardSource,
} from './common/ja-wikipedia-person-award';
import {hochiCeremonyNumber} from './hochi-film-awards';
import {type ImdbEventImportStats} from './imdb-event-award';
import {kinemaJunpoCeremonyNumber} from './kinema-junpo';
import {mainichiCeremonyNumber} from './mainichi-film-concours';

/**
 * 記事の表記とTMDbのクレジット名が別名で、表記の正規化では寄らないもの。
 * 芸名の使い分け・襲名・改名と、TMDbが平仮名や原語で登録している人
 */
const JAPANESE_NAME_ALIASES: Record<string, string> = {
  北野武: 'ビートたけし',
  夏木勲: '夏八木勲',
  藤純子: '富司純子',
  中村錦之助: '萬屋錦之介',
  中村賀津雄: '中村嘉葎雄',
  山本富士子: '山本ふじこ',
  ヨシ笈田: '笈田ヨシ',
  市川海老蔵: '十三代目 市川團十郎',
  市川染五郎: '十代目 松本幸四郎',
  瑛太: '永山瑛太',
};

/** 外国映画監督賞の受賞者。TMDbのクレジットが原語表記か綴りが違う */
const FOREIGN_DIRECTOR_ALIASES: Record<string, string> = {
  サタジット・レイ: 'Satyajit Ray',
  ジッロ・ポンテコルヴォ: 'Gillo Pontecorvo',
  フォルカー・シュレンドルフ: 'Volker Schlöndorff',
  スティーブン・スピルバーグ: 'スティーヴン・スピルバーグ',
  ミロシュ・フォアマン: 'ミロス・フォアマン',
  パオロ・タヴィアーニ: 'Paolo Taviani',
  ヴィットリオ・タヴィアーニ: 'Vittorio Taviani',
  ケビン・コスナー: 'ケヴィン・コスナー',
  エドワード・ヤン: '楊德昌',
  カーティス・ハンソン: 'Curtis Hanson',
  チアン・ウェン: 'Jiang Wen',
  賈樟柯: 'ジャ・ジャンクー',
  ワン・ビン: '王兵',
};

function actingCategories(): ListPersonAwardCategory[] {
  return [
    {names: ['主演男優賞'], category: '主演男優賞', role: 'actor'},
    {names: ['主演女優賞'], category: '主演女優賞', role: 'actor'},
    {names: ['助演男優賞'], category: '助演男優賞', role: 'actor'},
    {names: ['助演女優賞'], category: '助演女優賞', role: 'actor'},
  ];
}

export const JAPAN_PERSON_AWARD_SOURCES: ListPersonAwardSource[] = [
  {
    key: 'kinema-junpo',
    article: 'キネマ旬報',
    organizationName: 'Kinema Junpo',
    establishedYear: 1924,
    ceremonyNumber: kinemaJunpoCeremonyNumber,
    categories: [
      {names: ['日本映画監督賞'], category: '日本映画監督賞', role: 'director'},
      ...actingCategories(),
      {
        names: ['外国映画監督賞'],
        category: '外国映画監督賞',
        role: 'director',
        foreign: true,
      },
    ],
    resolutionOverrides: new Map([
      ['1959:人間の條件 第一部・第二部', 'tt0053114'],
      ['1966:エロ事師たちより 人類学入門', 'tt0060560'],
      ['1972:一条さゆり・濡れた欲情', 'tt0220570'],
      ['1988:噛む女', 'tt0095427'],
      ['1998:犬、走る DOG RACE', 'tt0416863'],
      ['2002:OUT', 'tt0340280'],
      ['2005:フライ,ダディ,フライ', 'tt0455490'],
      ['2015:ソロモンの偽証 前篇・事件/後篇・裁判', 'tt3421614'],
      ['2018:ポルトの恋人たち 時の記憶', 'tt6254732'],
      ['2020:アンダードッグ', 'tt14051616'],
      ['2020:本気のしるし〈劇場版〉', 'tt13276326'],
      // 記事は原作漫画へのリンクで、Wikidataは第1作を指す
      ['2023:東京リベンジャーズ2 血のハロウィン編 -運命-', 'tt23218142'],
      ['2025:聖☆おにいさん THE MOVIE〜ホーリーメンVS悪魔軍団〜', 'tt32446009'],
    ]),
    personNameAliases: {...JAPANESE_NAME_ALIASES, ...FOREIGN_DIRECTOR_ALIASES},
  },
  {
    key: 'mainichi',
    article: '毎日映画コンクール',
    organizationName: 'Mainichi Film Awards',
    establishedYear: 1946,
    ceremonyNumber: mainichiCeremonyNumber,
    categories: [
      {names: ['監督賞'], category: '監督賞', role: 'director'},
      // 第1回は「演技賞」、第2〜17回は「男優演技賞」の名称だった
      {
        names: ['男優主演賞', '男優演技賞', '演技賞'],
        category: '男優主演賞',
        role: 'actor',
      },
      {
        names: ['女優主演賞', '女優演技賞'],
        category: '女優主演賞',
        role: 'actor',
      },
      {names: ['男優助演賞'], category: '男優助演賞', role: 'actor'},
      {names: ['女優助演賞'], category: '女優助演賞', role: 'actor'},
      // 第3〜5回は性別のない「助演賞」で、受賞者の性別で振り分ける
      {
        names: ['助演賞'],
        category: '男優助演賞',
        role: 'actor',
        years: [1948, 1950],
      },
      {names: ['助演賞'], category: '女優助演賞', role: 'actor', years: [1949]},
      // 第79回(2024年)から男女の区別を撤廃した
      {names: ['主演俳優賞'], category: '主演俳優賞', role: 'actor'},
      {names: ['助演俳優賞'], category: '助演俳優賞', role: 'actor'},
    ],
    resolutionOverrides: new Map([
      ['1950:大利根の夜霧', 'tt13931408'],
      ['1955:おふくろ', 'tt0377097'],
      ['1955:渡り鳥いつ帰る', 'tt0259736'],
      ['1961:人間の條件（完結編）', 'tt0055233'],
      ['1991:アジアンビート アイ・ラブ・ニッポン', 'tt0388735'],
      ['1994:極道記者2', 'tt0193975'],
      ['1995:東京デラックス', 'tt0329163'],
      ['1996:KYOKO', 'tt0124773'],
      ['1998:犬、走る DOG RACE', 'tt0416863'],
      ['2002:OUT', 'tt0340280'],
      ['2003:釣りバカ日誌14 お遍路大パニック!', 'tt0417215'],
      ['2011:八日目の蝉', 'tt1727825'],
      ['2014:WOOD JOB! 〜神去なあなあ日常〜', 'tt2964120'],
      ['2020:アンダードッグ', 'tt14051616'],
      // 同名の1959年版があり、TMDbの題名検索では一意にならない
      ['2015:野火', 'tt3893038'],
    ]),
    personNameAliases: JAPANESE_NAME_ALIASES,
  },
  {
    key: 'blue-ribbon',
    article: 'ブルーリボン賞 (映画)',
    organizationName: 'Blue Ribbon Awards',
    establishedYear: 1950,
    ceremonyNumber: blueRibbonCeremonyNumber,
    categories: [
      {names: ['監督賞'], category: '監督賞', role: 'director'},
      ...actingCategories(),
    ],
    resolutionOverrides: new Map([
      ['1959:人間の條件 第1・2部', 'tt0053114'],
      ['1959:人間の條件 第3・4部', 'tt0053115'],
      ['1960:墨東綺譚', 'tt0053664'],
      ['1975:トラック野郎・御意見無用', 'tt0360088'],
      ['1975:トラック野郎・爆走一番星', 'tt0360085'],
      ['1983:逃れの街', 'tt0361961'],
      ['1988:噛む女', 'tt0095427'],
      ['2003:釣りバカ日誌14', 'tt0417215'],
      ['2005:フライ、ダディ、フライ', 'tt0455490'],
      ['2009:のだめカンタービレ 最終楽章', 'tt1337672'],
      ['2011:八日目の蝉', 'tt1727825'],
      ['2018:ちはやふる -結び-', 'tt6821870'],
      ['2019:コンフィデンスマンJP -ロマンス編-', 'tt9552258'],
      ['2020:コンフィデンスマンJP -プリンセス編-', 'tt12767996'],
      // 記事はテレビドラマと2008年の映画のもので、Wikidataは2008年版を指す
      ['1959:私は貝になりたい', 'tt0202919'],
    ]),
    personNameAliases: JAPANESE_NAME_ALIASES,
  },
  {
    key: 'hochi',
    article: '報知映画賞',
    organizationName: 'Hochi Film Awards',
    establishedYear: 1976,
    ceremonyNumber: hochiCeremonyNumber,
    categories: [
      {names: ['監督賞'], category: '監督賞', role: 'director'},
      ...actingCategories(),
    ],
    resolutionOverrides: new Map([
      ['1977:青春の門・自立篇', 'tt0203102'],
      ['1981:青春の門', 'tt0203101'],
      // 1979年製作でフランス公開、日本公開は1983年
      ['1983:草迷宮', 'tt0229520'],
      ['1991:アイ・ラブ・ニッポン', 'tt0388735'],
      ['1992:未来の想い出 Last Christmas', 'tt0189741'],
      ['1995:トイレの花子さん', 'tt0114688'],
      ['1998:犬、走る DOG RACE', 'tt0416863'],
      ['2003:釣りバカ日誌14 お遍路大パニック!', 'tt0417215'],
      ['2005:蟬しぐれ', 'tt0455748'],
      ['2005:フライ,ダディ,フライ', 'tt0455490'],
      ['2011:八日目の蝉', 'tt1727825'],
      ['2016:64 -ロクヨン-', 'tt4471630'],
      ['2019:マスカレード・ホテル', 'tt7502322'],
      ['2019:コンフィデンスマンJP -ロマンス編-', 'tt9552258'],
      ['2019:閉鎖病棟 -それぞれの朝-', 'tt9721798'],
      ['2021:老後の資金がありません!', 'tt11354164'],
    ]),
    personNameAliases: JAPANESE_NAME_ALIASES,
  },
];

export function findJapanPersonAwardSource(
  key: string,
): ListPersonAwardSource | undefined {
  return JAPAN_PERSON_AWARD_SOURCES.find(source => source.key === key);
}

export async function importJapanPersonAwards({
  environment,
  sources = JAPAN_PERSON_AWARD_SOURCES,
  category,
  dryRun = false,
  year,
  throttleMs = 300,
}: {
  environment: Environment;
  sources?: ListPersonAwardSource[];
  /** DBの部門名で1つに絞る */
  category?: string;
  dryRun?: boolean;
  /** 年度（記事の見出しの年） */
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

  for (const source of sources) {
    const categories =
      category === undefined
        ? source.categories
        : source.categories.filter(entry => entry.category === category);
    if (categories.length === 0) {
      continue;
    }

    const stats = await importListPersonAward({
      environment,
      source,
      categories,
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
