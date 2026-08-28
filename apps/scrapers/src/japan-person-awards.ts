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
