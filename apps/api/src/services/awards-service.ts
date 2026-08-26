import {and, eq, inArray, isNull, or, sql} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {BaseService} from './base-service';
import type {
  AwardDetail,
  AwardMovieEntry,
  AwardSummary,
  AwardYearDetail,
  AwardYearGroup,
  PersonAwardDetail,
  PersonAwardNominee,
  PersonAwardYearGroup,
} from '@shine/types';

export function findAwardPageDefinition(
  organizationName: string,
  categoryName?: string,
): AwardPageDefinition | undefined {
  const candidates = awardPageDefinitions.filter(
    entry => entry.organizationName === organizationName,
  );

  return categoryName === undefined
    ? candidates.length === 1
      ? candidates[0]
      : undefined
    : candidates.find(entry => entry.categoryNames.includes(categoryName));
}

export function awardPageLinkForOrganizationName(
  organizationName: string,
  categoryName?: string,
): {
  slug: string | undefined;
  hasYearPages: boolean;
} {
  const definition = findAwardPageDefinition(organizationName, categoryName);

  return {
    slug: definition?.slug,
    hasYearPages: definition?.grouping === 'year',
  };
}

/** 賞ページを持つ (組織, 部門) だけに絞る条件。個人賞などは含まない */
export function awardPageNominations() {
  return or(
    ...awardPageDefinitions.map(definition =>
      and(
        eq(awardOrganizations.name, definition.organizationName),
        inArray(awardCategories.name, definition.categoryNames),
      ),
    ),
  );
}

export function japaneseOrganizationName(
  organizationName: string,
): string | undefined {
  return awardPageDefinitions.find(
    entry => entry.organizationName === organizationName,
  )?.organization;
}

export function japaneseAwardNames(
  organizationName: string,
  categoryName: string,
): {organization?: string; category?: string} {
  const definition = findAwardPageDefinition(organizationName, categoryName);
  if (!definition) {
    const personDefinition = findPersonAwardDefinition(
      organizationName,
      categoryName,
    );
    if (personDefinition) {
      return {
        organization: personDefinition.organization,
        ...(personDefinition.categoryLabel && {
          category: personDefinition.categoryLabel,
        }),
      };
    }

    // 賞ページを持たない部門でも組織名だけは日本語にできる
    const organization = japaneseOrganizationName(organizationName);
    return organization ? {organization} : {};
  }

  // 複数カテゴリを束ねるページの name はページ名なので、カテゴリ名には使えない
  return definition.categoryNames.length === 1
    ? {organization: definition.organization, category: definition.name}
    : {organization: definition.organization};
}

export type PersonAwardDefinition = {
  slug: string;
  organizationName: string;
  categoryNames: string[];
  name: string;
  organization: string;
  /** DBの部門名が日本語でないときの表示名 */
  categoryLabel?: string;
  description: string;
  role: 'director' | 'actor';
};

export const personAwardDefinitions: PersonAwardDefinition[] = [
  {
    slug: 'academy-director',
    organizationName: 'Academy Awards',
    categoryNames: ['Academy Award for Best Director'],
    name: '監督賞',
    organization: 'アカデミー賞',
    categoryLabel: '監督賞',
    description:
      'アカデミー賞（オスカー）監督賞の歴代受賞者とノミネートの一覧。',
    role: 'director',
  },
  {
    slug: 'academy-lead-actor',
    organizationName: 'Academy Awards',
    categoryNames: ['Academy Award for Best Actor'],
    name: '主演男優賞',
    organization: 'アカデミー賞',
    categoryLabel: '主演男優賞',
    description:
      'アカデミー賞（オスカー）主演男優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'academy-lead-actress',
    organizationName: 'Academy Awards',
    categoryNames: ['Academy Award for Best Actress'],
    name: '主演女優賞',
    organization: 'アカデミー賞',
    categoryLabel: '主演女優賞',
    description:
      'アカデミー賞（オスカー）主演女優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'academy-supporting-actor',
    organizationName: 'Academy Awards',
    categoryNames: ['Academy Award for Best Supporting Actor'],
    name: '助演男優賞',
    organization: 'アカデミー賞',
    categoryLabel: '助演男優賞',
    description:
      'アカデミー賞（オスカー）助演男優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'academy-supporting-actress',
    organizationName: 'Academy Awards',
    categoryNames: ['Academy Award for Best Supporting Actress'],
    name: '助演女優賞',
    organization: 'アカデミー賞',
    categoryLabel: '助演女優賞',
    description:
      'アカデミー賞（オスカー）助演女優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'bafta-director',
    organizationName: 'British Academy Film Awards',
    categoryNames: ['BAFTA Award for Best Direction'],
    name: '監督賞',
    organization: '英国アカデミー賞',
    categoryLabel: '監督賞',
    description:
      '英国アカデミー賞（BAFTA）監督賞の歴代受賞者とノミネートの一覧。',
    role: 'director',
  },
  {
    slug: 'bafta-lead-actor',
    organizationName: 'British Academy Film Awards',
    categoryNames: ['BAFTA Award for Best Actor in a Leading Role'],
    name: '主演男優賞',
    organization: '英国アカデミー賞',
    categoryLabel: '主演男優賞',
    description:
      '英国アカデミー賞（BAFTA）主演男優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'bafta-lead-actress',
    organizationName: 'British Academy Film Awards',
    categoryNames: ['BAFTA Award for Best Actress in a Leading Role'],
    name: '主演女優賞',
    organization: '英国アカデミー賞',
    categoryLabel: '主演女優賞',
    description:
      '英国アカデミー賞（BAFTA）主演女優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'bafta-supporting-actor',
    organizationName: 'British Academy Film Awards',
    categoryNames: ['BAFTA Award for Best Actor in a Supporting Role'],
    name: '助演男優賞',
    organization: '英国アカデミー賞',
    categoryLabel: '助演男優賞',
    description:
      '英国アカデミー賞（BAFTA）助演男優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'bafta-supporting-actress',
    organizationName: 'British Academy Film Awards',
    categoryNames: ['BAFTA Award for Best Actress in a Supporting Role'],
    name: '助演女優賞',
    organization: '英国アカデミー賞',
    categoryLabel: '助演女優賞',
    description:
      '英国アカデミー賞（BAFTA）助演女優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'golden-globe-director',
    organizationName: 'Golden Globe Awards',
    categoryNames: ['Golden Globe Award for Best Director'],
    name: '監督賞',
    organization: 'ゴールデングローブ賞',
    categoryLabel: '監督賞',
    description: 'ゴールデングローブ賞 監督賞の歴代受賞者とノミネートの一覧。',
    role: 'director',
  },
  {
    slug: 'golden-globe-lead-actor-drama',
    organizationName: 'Golden Globe Awards',
    categoryNames: [
      'Golden Globe Award for Best Actor in a Motion Picture – Drama',
    ],
    name: '主演男優賞（ドラマ部門）',
    organization: 'ゴールデングローブ賞',
    categoryLabel: '主演男優賞（ドラマ部門）',
    description:
      'ゴールデングローブ賞 主演男優賞（ドラマ部門）の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'golden-globe-lead-actor-musical-comedy',
    organizationName: 'Golden Globe Awards',
    categoryNames: [
      'Golden Globe Award for Best Actor in a Motion Picture – Musical or Comedy',
    ],
    name: '主演男優賞（ミュージカル・コメディ部門）',
    organization: 'ゴールデングローブ賞',
    categoryLabel: '主演男優賞（ミュージカル・コメディ部門）',
    description:
      'ゴールデングローブ賞 主演男優賞（ミュージカル・コメディ部門）の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'golden-globe-lead-actress-drama',
    organizationName: 'Golden Globe Awards',
    categoryNames: [
      'Golden Globe Award for Best Actress in a Motion Picture – Drama',
    ],
    name: '主演女優賞（ドラマ部門）',
    organization: 'ゴールデングローブ賞',
    categoryLabel: '主演女優賞（ドラマ部門）',
    description:
      'ゴールデングローブ賞 主演女優賞（ドラマ部門）の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'golden-globe-lead-actress-musical-comedy',
    organizationName: 'Golden Globe Awards',
    categoryNames: [
      'Golden Globe Award for Best Actress in a Motion Picture – Musical or Comedy',
    ],
    name: '主演女優賞（ミュージカル・コメディ部門）',
    organization: 'ゴールデングローブ賞',
    categoryLabel: '主演女優賞（ミュージカル・コメディ部門）',
    description:
      'ゴールデングローブ賞 主演女優賞（ミュージカル・コメディ部門）の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'golden-globe-supporting-actor',
    organizationName: 'Golden Globe Awards',
    categoryNames: [
      'Golden Globe Award for Best Supporting Actor – Motion Picture',
    ],
    name: '助演男優賞',
    organization: 'ゴールデングローブ賞',
    categoryLabel: '助演男優賞',
    description:
      'ゴールデングローブ賞 助演男優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'golden-globe-supporting-actress',
    organizationName: 'Golden Globe Awards',
    categoryNames: [
      'Golden Globe Award for Best Supporting Actress – Motion Picture',
    ],
    name: '助演女優賞',
    organization: 'ゴールデングローブ賞',
    categoryLabel: '助演女優賞',
    description:
      'ゴールデングローブ賞 助演女優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'japan-academy-director',
    organizationName: 'Japan Academy Awards',
    categoryNames: ['監督賞'],
    name: '最優秀監督賞',
    organization: '日本アカデミー賞',
    description:
      '日本アカデミー賞 最優秀監督賞の歴代受賞者と優秀監督賞ノミネートの一覧。',
    role: 'director',
  },
  {
    slug: 'japan-academy-lead-actor',
    organizationName: 'Japan Academy Awards',
    categoryNames: ['主演男優賞'],
    name: '最優秀主演男優賞',
    organization: '日本アカデミー賞',
    description:
      '日本アカデミー賞 最優秀主演男優賞の歴代受賞者と優秀主演男優賞ノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'japan-academy-lead-actress',
    organizationName: 'Japan Academy Awards',
    categoryNames: ['主演女優賞'],
    name: '最優秀主演女優賞',
    organization: '日本アカデミー賞',
    description:
      '日本アカデミー賞 最優秀主演女優賞の歴代受賞者と優秀主演女優賞ノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'japan-academy-supporting-actor',
    organizationName: 'Japan Academy Awards',
    categoryNames: ['助演男優賞'],
    name: '最優秀助演男優賞',
    organization: '日本アカデミー賞',
    description:
      '日本アカデミー賞 最優秀助演男優賞の歴代受賞者と優秀助演男優賞ノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'japan-academy-supporting-actress',
    organizationName: 'Japan Academy Awards',
    categoryNames: ['助演女優賞'],
    name: '最優秀助演女優賞',
    organization: '日本アカデミー賞',
    description:
      '日本アカデミー賞 最優秀助演女優賞の歴代受賞者と優秀助演女優賞ノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'cannes-best-director',
    organizationName: 'Cannes Film Festival',
    categoryNames: ['Best Director'],
    name: '監督賞',
    organization: 'カンヌ国際映画祭',
    categoryLabel: '監督賞',
    description: 'カンヌ国際映画祭 監督賞の歴代受賞者の一覧。',
    role: 'director',
  },
  {
    slug: 'cannes-best-actor',
    organizationName: 'Cannes Film Festival',
    categoryNames: ['Best Actor'],
    name: '男優賞',
    organization: 'カンヌ国際映画祭',
    categoryLabel: '男優賞',
    description: 'カンヌ国際映画祭 男優賞の歴代受賞者の一覧。',
    role: 'actor',
  },
  {
    slug: 'cannes-best-actress',
    organizationName: 'Cannes Film Festival',
    categoryNames: ['Best Actress'],
    name: '女優賞',
    organization: 'カンヌ国際映画祭',
    categoryLabel: '女優賞',
    description: 'カンヌ国際映画祭 女優賞の歴代受賞者の一覧。',
    role: 'actor',
  },
];

export function findPersonAwardDefinition(
  organizationName: string,
  categoryName: string,
): PersonAwardDefinition | undefined {
  return personAwardDefinitions.find(
    entry =>
      entry.organizationName === organizationName &&
      entry.categoryNames.includes(categoryName),
  );
}

/** 個人賞の (組織, 部門) を役割で絞る条件 */
export function personAwardNominations(role: PersonAwardDefinition['role']) {
  return or(
    ...personAwardDefinitions
      .filter(definition => definition.role === role)
      .map(definition =>
        and(
          eq(awardOrganizations.name, definition.organizationName),
          inArray(awardCategories.name, definition.categoryNames),
        ),
      ),
  );
}

const RANK_PATTERN = /^(\d+)位$/;

function rankOf(entry: AwardMovieEntry): number {
  const matched = RANK_PATTERN.exec(entry.specialMention ?? '');
  return matched ? Number(matched[1]) : Infinity;
}

function compareAwardMovies(a: AwardMovieEntry, b: AwardMovieEntry): number {
  const rankA = rankOf(a);
  const rankB = rankOf(b);

  return rankA === rankB
    ? Number(b.isWinner) - Number(a.isWinner)
    : rankA - rankB;
}

function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : Number(a > b);
}

function compareNominees(a: PersonAwardNominee, b: PersonAwardNominee): number {
  return (
    Number(b.isWinner) - Number(a.isWinner) || compareCodePoints(a.name, b.name)
  );
}

type CategorySelector = {
  organizationName: string;
  categoryNames: string[];
};

export type AwardPageDefinition = {
  slug: string;
  shortLabel: string;
  organizationName: string;
  categoryNames: string[];
  name: string;
  organization: string;
  description: string;
  grouping: 'year' | 'list';
};

export const awardPageDefinitions: AwardPageDefinition[] = [
  {
    slug: 'palme-dor',
    shortLabel: 'カンヌ',
    organizationName: 'Cannes Film Festival',
    categoryNames: ["Palme d'Or"],
    name: 'パルム・ドール',
    organization: 'カンヌ国際映画祭',
    description:
      'カンヌ国際映画祭の最高賞パルム・ドールの歴代受賞作と公式出品作の一覧。',
    grouping: 'year',
  },
  {
    slug: 'venice-golden-lion',
    shortLabel: 'ヴェネツィア',
    organizationName: 'Venice Film Festival',
    categoryNames: ['Golden Lion'],
    name: '金獅子賞',
    organization: 'ヴェネツィア国際映画祭',
    description:
      'ヴェネツィア国際映画祭の最高賞・金獅子賞の歴代受賞作とコンペティション部門出品作の一覧。',
    grouping: 'year',
  },
  {
    slug: 'berlin-golden-bear',
    shortLabel: 'ベルリン',
    organizationName: 'Berlin International Film Festival',
    categoryNames: ['Golden Bear'],
    name: '金熊賞',
    organization: 'ベルリン国際映画祭',
    description:
      'ベルリン国際映画祭の最高賞・金熊賞の歴代受賞作とコンペティション部門出品作の一覧。',
    grouping: 'year',
  },
  {
    slug: 'academy-best-picture',
    shortLabel: 'アカデミー',
    organizationName: 'Academy Awards',
    categoryNames: ['Academy Award for Best Picture'],
    name: '作品賞',
    organization: 'アカデミー賞',
    description:
      'アカデミー賞（オスカー）作品賞の歴代受賞作とノミネート作品の一覧。',
    grouping: 'year',
  },
  {
    slug: 'bafta-best-film',
    shortLabel: 'BAFTA',
    organizationName: 'British Academy Film Awards',
    categoryNames: ['BAFTA Award for Best Film'],
    name: '作品賞',
    organization: '英国アカデミー賞',
    description:
      '英国アカデミー賞（BAFTA）作品賞の歴代受賞作とノミネート作品の一覧。',
    grouping: 'year',
  },
  {
    slug: 'golden-globe-drama',
    shortLabel: 'GGドラマ',
    organizationName: 'Golden Globe Awards',
    categoryNames: ['Golden Globe Award for Best Motion Picture – Drama'],
    name: '作品賞（ドラマ部門）',
    organization: 'ゴールデングローブ賞',
    description:
      'ゴールデングローブ賞 作品賞（ドラマ部門）の歴代受賞作とノミネート作品の一覧。',
    grouping: 'year',
  },
  {
    slug: 'golden-globe-musical-comedy',
    shortLabel: 'GGコメディ',
    organizationName: 'Golden Globe Awards',
    categoryNames: [
      'Golden Globe Award for Best Motion Picture – Musical or Comedy',
    ],
    name: '作品賞（ミュージカル・コメディ部門）',
    organization: 'ゴールデングローブ賞',
    description:
      'ゴールデングローブ賞 作品賞（ミュージカル・コメディ部門）の歴代受賞作とノミネート作品の一覧。',
    grouping: 'year',
  },
  {
    slug: 'golden-globe-non-english',
    shortLabel: 'GG非英語',
    organizationName: 'Golden Globe Awards',
    categoryNames: [
      'Golden Globe Award for Best Motion Picture – Non-English Language',
    ],
    name: '非英語映画賞',
    organization: 'ゴールデングローブ賞',
    description:
      'ゴールデングローブ賞 非英語映画賞（旧・外国語映画賞）の歴代受賞作とノミネート作品の一覧。',
    grouping: 'year',
  },
  {
    slug: 'golden-globe-animated',
    shortLabel: 'GGアニメ',
    organizationName: 'Golden Globe Awards',
    categoryNames: ['Golden Globe Award for Best Animated Feature Film'],
    name: 'アニメーション映画賞',
    organization: 'ゴールデングローブ賞',
    description:
      'ゴールデングローブ賞 アニメーション映画賞の歴代受賞作とノミネート作品の一覧。',
    grouping: 'year',
  },
  {
    slug: 'japan-academy-best-picture',
    shortLabel: '日本アカデミー',
    organizationName: 'Japan Academy Awards',
    categoryNames: ['最優秀作品賞', '優秀作品賞'],
    name: '最優秀作品賞',
    organization: '日本アカデミー賞',
    description:
      '日本アカデミー賞 最優秀作品賞の歴代受賞作と優秀作品賞ノミネートの一覧。',
    grouping: 'year',
  },
  {
    slug: 'kinema-junpo-japanese',
    shortLabel: 'キネ旬日本',
    organizationName: 'Kinema Junpo',
    categoryNames: ['Best Japanese Film'],
    name: '日本映画ベスト・テン',
    organization: 'キネマ旬報',
    description:
      'キネマ旬報ベスト・テン日本映画部門の歴代ベストワンと年別ランキングの一覧。',
    grouping: 'year',
  },
  {
    slug: 'kinema-junpo-foreign',
    shortLabel: 'キネ旬外国',
    organizationName: 'Kinema Junpo',
    categoryNames: ['Best Foreign Film'],
    name: '外国映画ベスト・テン',
    organization: 'キネマ旬報',
    description:
      'キネマ旬報ベスト・テン外国映画部門の歴代ベストワンと年別ランキングの一覧。',
    grouping: 'year',
  },
  {
    slug: 'mainichi-japanese',
    shortLabel: '毎日日本',
    organizationName: 'Mainichi Film Awards',
    categoryNames: ['日本映画大賞', '日本映画優秀賞'],
    name: '日本映画大賞',
    organization: '毎日映画コンクール',
    description:
      '毎日映画コンクール 日本映画大賞の歴代受賞作と日本映画優秀賞の一覧。',
    grouping: 'year',
  },
  {
    slug: 'mainichi-foreign',
    shortLabel: '毎日外国',
    organizationName: 'Mainichi Film Awards',
    categoryNames: ['外国映画ベストワン賞'],
    name: '外国映画ベストワン賞',
    organization: '毎日映画コンクール',
    description: '毎日映画コンクール 外国映画ベストワン賞の歴代受賞作の一覧。',
    grouping: 'year',
  },
  {
    slug: 'blue-ribbon-japanese',
    shortLabel: 'BR日本',
    organizationName: 'Blue Ribbon Awards',
    categoryNames: ['作品賞'],
    name: '作品賞',
    organization: 'ブルーリボン賞',
    description: 'ブルーリボン賞 作品賞の歴代受賞作の一覧。',
    grouping: 'year',
  },
  {
    slug: 'blue-ribbon-foreign',
    shortLabel: 'BR外国',
    organizationName: 'Blue Ribbon Awards',
    categoryNames: ['外国作品賞'],
    name: '外国作品賞',
    organization: 'ブルーリボン賞',
    description: 'ブルーリボン賞 外国作品賞の歴代受賞作の一覧。',
    grouping: 'year',
  },
  {
    slug: 'hochi-japanese',
    shortLabel: '報知日本',
    organizationName: 'Hochi Film Awards',
    categoryNames: ['作品賞'],
    name: '作品賞',
    organization: '報知映画賞',
    description: '報知映画賞 作品賞の歴代受賞作の一覧。',
    grouping: 'year',
  },
  {
    slug: 'hochi-foreign',
    shortLabel: '報知海外',
    organizationName: 'Hochi Film Awards',
    categoryNames: ['作品賞・海外部門'],
    name: '作品賞・海外部門',
    organization: '報知映画賞',
    description: '報知映画賞 作品賞・海外部門の歴代受賞作の一覧。',
    grouping: 'year',
  },
  {
    slug: 'nikkan-sports-japanese',
    shortLabel: '日刊日本',
    organizationName: 'Nikkan Sports Film Awards',
    categoryNames: ['作品賞'],
    name: '作品賞',
    organization: '日刊スポーツ映画大賞',
    description: '日刊スポーツ映画大賞 作品賞の歴代受賞作の一覧。',
    grouping: 'year',
  },
  {
    slug: 'nikkan-sports-foreign',
    shortLabel: '日刊外国',
    organizationName: 'Nikkan Sports Film Awards',
    categoryNames: ['外国作品賞'],
    name: '外国作品賞',
    organization: '日刊スポーツ映画大賞',
    description: '日刊スポーツ映画大賞 外国作品賞の歴代受賞作の一覧。',
    grouping: 'year',
  },
  {
    slug: 'nikkan-sports-yujiro',
    shortLabel: '裕次郎賞',
    organizationName: 'Nikkan Sports Film Awards',
    categoryNames: ['石原裕次郎賞'],
    name: '石原裕次郎賞',
    organization: '日刊スポーツ映画大賞',
    description:
      '日刊スポーツ映画大賞 石原裕次郎賞の歴代受賞作の一覧。故・石原裕次郎の名を冠し、その年最もエンタテインメント性に富んだ作品に贈られる。',
    grouping: 'year',
  },
  {
    slug: 'yokohama-best-ten',
    shortLabel: 'ヨコハマ',
    organizationName: 'Yokohama Film Festival',
    categoryNames: ['日本映画ベストテン'],
    name: '日本映画ベストテン',
    organization: 'ヨコハマ映画祭',
    description:
      'ヨコハマ映画祭 日本映画ベストテンの歴代1位（作品賞）と年別ランキングの一覧。映画ファンが市民レベルで1980年から横浜で続けている映画祭。',
    grouping: 'year',
  },
  {
    slug: '1001-movies',
    shortLabel: '1001本',
    organizationName: '1001 Movies You Must See Before You Die',
    categoryNames: ['Selected Films'],
    name: '死ぬまでに観たい映画1001本',
    organization: '1001 Movies You Must See Before You Die',
    description: '書籍『死ぬまでに観たい映画1001本』に選ばれた映画の一覧。',
    grouping: 'list',
  },
  {
    slug: 'popeye-21st-century',
    shortLabel: 'POPEYE',
    organizationName: 'POPEYE',
    categoryNames: [
      '21ST CENTURY MOVIE GREATEST HITS (POPEYE ISSUE 944 DECEMBER 2025)',
    ],
    name: '21st Century Movie Greatest Hits',
    organization: 'POPEYE',
    description:
      '雑誌POPEYE（No. 944）の特集「21ST CENTURY MOVIE GREATEST HITS」で選ばれた映画の一覧。',
    grouping: 'list',
  },
  {
    slug: 'brutus-japanese-film',
    shortLabel: 'BRUTUS',
    organizationName: 'BRUTUS',
    categoryNames: ['美しき、日本映画。(BRUTUS No. 1043)'],
    name: '美しき、日本映画。',
    organization: 'BRUTUS',
    description:
      '雑誌BRUTUS（No. 1043）の特集「美しき、日本映画。」で選ばれた映画の一覧。',
    grouping: 'list',
  },
  {
    slug: 'variety-top-100',
    shortLabel: 'Variety',
    organizationName: 'Variety',
    categoryNames: ['Top 100 Greatest Movies of All Time'],
    name: 'Top 100 Greatest Movies of All Time',
    organization: 'Variety',
    description:
      'Variety誌が選ぶ「史上最高の映画トップ100」に選ばれた映画の一覧。',
    grouping: 'list',
  },
  {
    slug: 'time-underappreciated',
    shortLabel: 'TIME',
    organizationName: 'TIME',
    categoryNames: ['The 50 Most Underappreciated Movies of the 21st Century'],
    name: 'The 50 Most Underappreciated Movies of the 21st Century',
    organization: 'TIME',
    description:
      'TIME誌が選ぶ「過小評価された21世紀の映画50本」に選ばれた映画の一覧。',
    grouping: 'list',
  },
  {
    slug: 'ign-japan-starter-pack',
    shortLabel: 'IGN',
    organizationName: 'IGN Japan',
    categoryNames: ['スターターパック&スキルツリー'],
    name: 'スターターパック&スキルツリー',
    organization: 'IGN Japan',
    description:
      'IGN Japanの映画特集「スターターパック&スキルツリー」で選ばれた映画の一覧。',
    grouping: 'list',
  },
];

const AWARD_LIST_PAGE_SIZE = 100;

function mergeMoviesByUid(
  movies: AwardMovieEntry[],
  byUid: Map<string, AwardMovieEntry>,
): void {
  for (const movie of movies) {
    const existing = byUid.get(movie.uid);
    if (existing) {
      existing.isWinner ||= movie.isWinner;
      continue;
    }

    byUid.set(movie.uid, movie);
  }
}

function flattenListAward(years: AwardYearGroup[]): AwardYearGroup[] {
  const byUid = new Map<string, AwardMovieEntry>();
  for (const group of years) {
    mergeMoviesByUid(group.movies, byUid);
  }

  const movies = byUid
    .values()
    .toArray()
    .toSorted(
      (a, b) =>
        (b.movieYear ?? 0) - (a.movieYear ?? 0) || (a.uid < b.uid ? -1 : 1),
    );

  return [
    {
      year: years[0].year,
      ceremonyNumber: years[0].ceremonyNumber,
      filmCount: movies.length,
      movies,
    },
  ];
}

/**
 * リスト型の賞をページに切り出す。範囲外のページはundefined(=404)。
 * キャッシュ済みの全件データに対して適用する前提の純粋関数
 */
export function paginateAwardDetail(
  award: AwardDetail,
  page: number,
): AwardDetail | undefined {
  if (award.grouping !== 'list') {
    return award;
  }

  const [group] = award.years;
  const totalCount = group?.filmCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / AWARD_LIST_PAGE_SIZE));
  if (page > totalPages) {
    return undefined;
  }

  const start = (page - 1) * AWARD_LIST_PAGE_SIZE;

  return {
    ...award,
    years: [
      {
        ...group,
        movies: group.movies.slice(start, start + AWARD_LIST_PAGE_SIZE),
      },
    ],
    pagination: {
      page,
      perPage: AWARD_LIST_PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}

export class AwardsService extends BaseService {
  async getAwardBySlug(slug: string): Promise<AwardDetail | undefined> {
    const definition = awardPageDefinitions.find(entry => entry.slug === slug);
    if (!definition) {
      return undefined;
    }

    const categoryUids = await this.resolveCategoryUids(definition);
    if (categoryUids.length === 0) {
      return undefined;
    }

    const rows = await this.database
      .select({
        movieUid: movies.uid,
        movieYear: movies.year,
        isWinner: nominations.isWinner,
        specialMention: nominations.specialMention,
        ceremonyYear: awardCeremonies.year,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        jaTitle: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
            AND translations.language_code = 'ja'
          LIMIT 1
        )`.as('jaTitle'),
        defaultTitle: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
          ORDER BY translations.is_default DESC
          LIMIT 1
        )`.as('defaultTitle'),
        posterUrl: sql<string | null>`(
          SELECT url FROM poster_urls
          WHERE poster_urls.movie_uid = movies.uid
          ORDER BY poster_urls.is_primary DESC
          LIMIT 1
        )`.as('posterUrl'),
      })
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .where(
        and(
          inArray(nominations.categoryUid, categoryUids),
          isNull(movies.deletedAt),
        ),
      );

    if (rows.length === 0) {
      return undefined;
    }

    const groups = new Map<number, AwardYearGroup>();
    for (const row of rows) {
      let group = groups.get(row.ceremonyYear);
      if (!group) {
        group = {
          year: row.ceremonyYear,
          ceremonyNumber: row.ceremonyNumber ?? undefined,
          filmCount: 0,
          movies: [],
        };
        groups.set(row.ceremonyYear, group);
      }

      const existing = group.movies.find(movie => movie.uid === row.movieUid);
      if (existing) {
        existing.isWinner ||= row.isWinner === 1;
        continue;
      }

      group.movies.push({
        uid: row.movieUid,
        title: row.jaTitle ?? row.defaultTitle ?? undefined,
        movieYear: row.movieYear ?? undefined,
        posterUrl: row.posterUrl ?? undefined,
        isWinner: row.isWinner === 1,
        specialMention: row.specialMention ?? undefined,
      });
    }

    const years = groups
      .values()
      .toArray()
      .toSorted((a, b) => b.year - a.year);
    for (const group of years) {
      group.filmCount = group.movies.length;
      group.movies.sort(compareAwardMovies);
    }

    const base = {
      slug: definition.slug,
      name: definition.name,
      organization: definition.organization,
      description: definition.description,
      grouping: definition.grouping,
    };

    if (definition.grouping === 'year') {
      return {
        ...base,
        years: years.map(group => ({
          ...group,
          movies: group.movies.filter(movie => movie.isWinner),
        })),
      };
    }

    return {...base, years: flattenListAward(years)};
  }

  async getAwardYear(
    slug: string,
    year: number,
  ): Promise<AwardYearDetail | undefined> {
    const definition = awardPageDefinitions.find(entry => entry.slug === slug);
    if (!definition || definition.grouping !== 'year') {
      return undefined;
    }

    const categoryUids = await this.resolveCategoryUids(definition);
    if (categoryUids.length === 0) {
      return undefined;
    }

    const rows = await this.database
      .select({
        movieUid: movies.uid,
        movieYear: movies.year,
        isWinner: nominations.isWinner,
        specialMention: nominations.specialMention,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        jaTitle: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
            AND translations.language_code = 'ja'
          LIMIT 1
        )`.as('jaTitle'),
        defaultTitle: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
          ORDER BY translations.is_default DESC
          LIMIT 1
        )`.as('defaultTitle'),
        posterUrl: sql<string | null>`(
          SELECT url FROM poster_urls
          WHERE poster_urls.movie_uid = movies.uid
          ORDER BY poster_urls.is_primary DESC
          LIMIT 1
        )`.as('posterUrl'),
      })
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .where(
        and(
          inArray(nominations.categoryUid, categoryUids),
          eq(awardCeremonies.year, year),
          isNull(movies.deletedAt),
        ),
      );

    if (rows.length === 0) {
      return undefined;
    }

    const movieEntries: AwardMovieEntry[] = [];
    for (const row of rows) {
      const existing = movieEntries.find(movie => movie.uid === row.movieUid);
      if (existing) {
        existing.isWinner ||= row.isWinner === 1;
        continue;
      }

      movieEntries.push({
        uid: row.movieUid,
        title: row.jaTitle ?? row.defaultTitle ?? undefined,
        movieYear: row.movieYear ?? undefined,
        posterUrl: row.posterUrl ?? undefined,
        isWinner: row.isWinner === 1,
        specialMention: row.specialMention ?? undefined,
      });
    }

    movieEntries.sort(compareAwardMovies);

    const yearRows = await this.database
      .selectDistinct({year: awardCeremonies.year})
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .where(
        and(
          inArray(nominations.categoryUid, categoryUids),
          isNull(movies.deletedAt),
        ),
      );

    const years = yearRows.map(row => row.year).toSorted((a, b) => a - b);
    const index = years.indexOf(year);

    return {
      slug: definition.slug,
      name: definition.name,
      organization: definition.organization,
      description: definition.description,
      year,
      ceremonyNumber: rows[0].ceremonyNumber ?? undefined,
      movies: movieEntries,
      // eslint-disable-next-line unicorn/no-useless-undefined -- 三項の分岐として省略できない
      previousYear: index > 0 ? years[index - 1] : undefined,
      nextYear: index < years.length - 1 ? years[index + 1] : undefined,
    };
  }

  async listAwards(): Promise<AwardSummary[]> {
    const summaries: AwardSummary[] = [];

    for (const definition of awardPageDefinitions) {
      const summary = await this.summarizeAward(
        definition,
        definition.grouping,
      );
      if (summary) {
        summaries.push(summary);
      }
    }

    for (const definition of personAwardDefinitions) {
      const summary = await this.summarizeAward(definition, 'person');
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries;
  }

  async getPersonAwardBySlug(
    slug: string,
  ): Promise<PersonAwardDetail | undefined> {
    const definition = personAwardDefinitions.find(
      entry => entry.slug === slug,
    );
    if (!definition) {
      return undefined;
    }

    const categoryUids = await this.resolveCategoryUids(definition);
    if (categoryUids.length === 0) {
      return undefined;
    }

    const rows = await this.database
      .select({
        personUid: people.uid,
        personName: people.name,
        profilePath: people.profilePath,
        jaName: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = people.uid
            AND translations.resource_type = 'person_name'
            AND translations.language_code = 'ja'
          LIMIT 1
        )`.as('jaName'),
        isWinner: nominations.isWinner,
        ceremonyYear: awardCeremonies.year,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        movieUid: movies.uid,
        movieYear: movies.year,
        jaTitle: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
            AND translations.language_code = 'ja'
          LIMIT 1
        )`.as('jaTitle'),
        defaultTitle: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
          ORDER BY translations.is_default DESC
          LIMIT 1
        )`.as('defaultTitle'),
      })
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .innerJoin(people, eq(nominations.personUid, people.uid))
      .where(
        and(
          inArray(nominations.categoryUid, categoryUids),
          isNull(movies.deletedAt),
        ),
      );

    if (rows.length === 0) {
      return undefined;
    }

    const groups = new Map<number, PersonAwardYearGroup>();
    for (const row of rows) {
      let group = groups.get(row.ceremonyYear);
      if (!group) {
        group = {
          year: row.ceremonyYear,
          ceremonyNumber: row.ceremonyNumber ?? undefined,
          nominees: [],
        };
        groups.set(row.ceremonyYear, group);
      }

      let nominee = group.nominees.find(entry => entry.uid === row.personUid);
      if (!nominee) {
        nominee = {
          uid: row.personUid,
          name: row.jaName ?? row.personName,
          originalName: row.personName,
          profilePath: row.profilePath ?? undefined,
          isWinner: false,
          movies: [],
        };
        group.nominees.push(nominee);
      }

      nominee.isWinner ||= row.isWinner === 1;
      if (nominee.movies.every(movie => movie.uid !== row.movieUid)) {
        nominee.movies.push({
          uid: row.movieUid,
          title: row.jaTitle ?? row.defaultTitle ?? undefined,
          movieYear: row.movieYear ?? undefined,
        });
      }
    }

    const years = groups
      .values()
      .toArray()
      .toSorted((a, b) => b.year - a.year);
    for (const group of years) {
      group.nominees.sort(compareNominees);
      for (const nominee of group.nominees) {
        nominee.movies.sort((a, b) =>
          compareCodePoints(a.title ?? '', b.title ?? ''),
        );
      }
    }

    return {
      slug: definition.slug,
      name: definition.name,
      organization: definition.organization,
      description: definition.description,
      grouping: 'person',
      years,
    };
  }

  private async summarizeAward(
    definition: AwardPageDefinition | PersonAwardDefinition,
    grouping: AwardSummary['grouping'],
  ): Promise<AwardSummary | undefined> {
    const categoryUids = await this.resolveCategoryUids(definition);
    if (categoryUids.length === 0) {
      return undefined;
    }

    const [aggregate] = await this.database
      .select({
        movieCount: sql<number>`COUNT(DISTINCT ${nominations.movieUid})`,
        personCount: sql<number>`COUNT(DISTINCT ${nominations.personUid})`,
        firstYear: sql<number | null>`MIN(${awardCeremonies.year})`,
        lastYear: sql<number | null>`MAX(${awardCeremonies.year})`,
      })
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(nominations.ceremonyUid, awardCeremonies.uid),
      )
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .where(
        and(
          inArray(nominations.categoryUid, categoryUids),
          isNull(movies.deletedAt),
        ),
      );

    if (
      !aggregate ||
      aggregate.movieCount === 0 ||
      aggregate.firstYear === null ||
      aggregate.lastYear === null
    ) {
      return undefined;
    }

    return {
      slug: definition.slug,
      name: definition.name,
      organization: definition.organization,
      description: definition.description,
      grouping,
      movieCount: aggregate.movieCount,
      ...(grouping === 'person' && {personCount: aggregate.personCount}),
      firstYear: aggregate.firstYear,
      lastYear: aggregate.lastYear,
    };
  }

  private async resolveCategoryUids(
    definition: CategorySelector,
  ): Promise<string[]> {
    const rows = await this.database
      .select({uid: awardCategories.uid})
      .from(awardCategories)
      .innerJoin(
        awardOrganizations,
        eq(awardCategories.organizationUid, awardOrganizations.uid),
      )
      .where(
        and(
          eq(awardOrganizations.name, definition.organizationName),
          inArray(awardCategories.name, definition.categoryNames),
        ),
      );
    return rows.map(row => row.uid);
  }
}
