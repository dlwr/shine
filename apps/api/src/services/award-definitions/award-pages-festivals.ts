import {cannes, venice, berlin} from './organizations';
import type {AwardPageDefinition} from './types';

export const festivalAwardPageDefinitions: AwardPageDefinition[] = [
  {
    slug: 'palme-dor',
    shortLabel: 'カンヌ',
    ...cannes,
    categoryNames: ["Palme d'Or"],
    name: 'パルム・ドール',
    description:
      'カンヌ国際映画祭の最高賞パルム・ドールの歴代受賞作と公式出品作の一覧。',
    grouping: 'year',
  },
  {
    slug: 'cannes-grand-prix',
    shortLabel: 'カンヌGP',
    ...cannes,
    categoryNames: ['Grand Prix'],
    name: 'グランプリ',
    description:
      'カンヌ国際映画祭でパルム・ドールに次ぐグランプリ（審査員グランプリ）の歴代受賞作の一覧。',
    grouping: 'year',
    subAward: true,
  },
  {
    slug: 'cannes-jury-prize',
    shortLabel: 'カンヌ審査員賞',
    ...cannes,
    categoryNames: ['Jury Prize'],
    name: '審査員賞',
    description: 'カンヌ国際映画祭 審査員賞の歴代受賞作の一覧。',
    grouping: 'year',
    subAward: true,
  },
  {
    slug: 'venice-golden-lion',
    shortLabel: 'ヴェネツィア',
    ...venice,
    categoryNames: ['Golden Lion'],
    name: '金獅子賞',
    description:
      'ヴェネツィア国際映画祭の最高賞・金獅子賞の歴代受賞作とコンペティション部門出品作の一覧。',
    grouping: 'year',
  },
  {
    slug: 'venice-grand-jury-prize',
    shortLabel: 'ヴェネツィア審査員大賞',
    ...venice,
    categoryNames: ['Grand Jury Prize'],
    name: '審査員大賞',
    description:
      'ヴェネツィア国際映画祭で金獅子賞に次ぐ審査員大賞（銀獅子賞）の歴代受賞作の一覧。',
    grouping: 'year',
    subAward: true,
  },
  {
    slug: 'venice-special-jury-prize',
    shortLabel: 'ヴェネツィア審査員特別賞',
    ...venice,
    categoryNames: ['Special Jury Prize'],
    name: '審査員特別賞',
    description: 'ヴェネツィア国際映画祭 審査員特別賞の歴代受賞作の一覧。',
    grouping: 'year',
    subAward: true,
  },
  {
    slug: 'berlin-golden-bear',
    shortLabel: 'ベルリン',
    ...berlin,
    categoryNames: ['Golden Bear'],
    name: '金熊賞',
    description:
      'ベルリン国際映画祭の最高賞・金熊賞の歴代受賞作とコンペティション部門出品作の一覧。',
    grouping: 'year',
  },
  {
    slug: 'berlin-grand-jury-prize',
    shortLabel: 'ベルリン審査員GP',
    ...berlin,
    categoryNames: ['Silver Bear Grand Jury Prize'],
    name: '銀熊賞（審査員グランプリ）',
    description:
      'ベルリン国際映画祭で金熊賞に次ぐ銀熊賞（審査員グランプリ）の歴代受賞作の一覧。',
    grouping: 'year',
    subAward: true,
  },
  {
    slug: 'berlin-jury-prize',
    shortLabel: 'ベルリン審査員賞',
    ...berlin,
    categoryNames: ['Silver Bear Jury Prize'],
    name: '銀熊賞（審査員賞）',
    description: 'ベルリン国際映画祭 銀熊賞（審査員賞）の歴代受賞作の一覧。',
    grouping: 'year',
    subAward: true,
  },
];
