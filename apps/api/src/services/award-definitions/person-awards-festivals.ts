import {cannes, venice, berlin} from './organizations';
import type {PersonAwardDefinition} from './types';

export const festivalPersonAwardDefinitions: PersonAwardDefinition[] = [
  {
    slug: 'cannes-best-director',
    ...cannes,
    categoryNames: ['Best Director'],
    name: '監督賞',
    categoryLabel: '監督賞',
    description: 'カンヌ国際映画祭 監督賞の歴代受賞者の一覧。',
    role: 'director',
  },
  {
    slug: 'cannes-best-actor',
    ...cannes,
    categoryNames: ['Best Actor'],
    name: '男優賞',
    categoryLabel: '男優賞',
    description: 'カンヌ国際映画祭 男優賞の歴代受賞者の一覧。',
    role: 'actor',
  },
  {
    slug: 'cannes-best-actress',
    ...cannes,
    categoryNames: ['Best Actress'],
    name: '女優賞',
    categoryLabel: '女優賞',
    description: 'カンヌ国際映画祭 女優賞の歴代受賞者の一覧。',
    role: 'actor',
  },
  {
    slug: 'venice-best-director',
    ...venice,
    categoryNames: ['Silver Lion for Best Director'],
    name: '銀獅子賞（監督賞）',
    categoryLabel: '銀獅子賞（監督賞）',
    description:
      'ヴェネツィア国際映画祭 銀獅子賞（監督賞）の歴代受賞者の一覧。',
    role: 'director',
  },
  {
    slug: 'venice-best-actor',
    ...venice,
    categoryNames: ['Volpi Cup for Best Actor'],
    name: 'ヴォルピ杯 男優賞',
    categoryLabel: 'ヴォルピ杯 男優賞',
    description: 'ヴェネツィア国際映画祭 ヴォルピ杯 男優賞の歴代受賞者の一覧。',
    role: 'actor',
  },
  {
    slug: 'venice-best-actress',
    ...venice,
    categoryNames: ['Volpi Cup for Best Actress'],
    name: 'ヴォルピ杯 女優賞',
    categoryLabel: 'ヴォルピ杯 女優賞',
    description: 'ヴェネツィア国際映画祭 ヴォルピ杯 女優賞の歴代受賞者の一覧。',
    role: 'actor',
  },
  {
    slug: 'berlin-best-director',
    ...berlin,
    categoryNames: ['Silver Bear for Best Director'],
    name: '銀熊賞（監督賞）',
    categoryLabel: '銀熊賞（監督賞）',
    description: 'ベルリン国際映画祭 銀熊賞（監督賞）の歴代受賞者の一覧。',
    role: 'director',
  },
  {
    slug: 'berlin-best-actor',
    ...berlin,
    categoryNames: ['Silver Bear for Best Actor'],
    name: '銀熊賞（男優賞）',
    categoryLabel: '銀熊賞（男優賞）',
    description:
      'ベルリン国際映画祭 銀熊賞（男優賞）の歴代受賞者の一覧。2020年を最後に廃止され、2021年からは性別のない主演俳優賞・助演俳優賞に再編された。',
    role: 'actor',
  },
  {
    slug: 'berlin-best-actress',
    ...berlin,
    categoryNames: ['Silver Bear for Best Actress'],
    name: '銀熊賞（女優賞）',
    categoryLabel: '銀熊賞（女優賞）',
    description:
      'ベルリン国際映画祭 銀熊賞（女優賞）の歴代受賞者の一覧。2020年を最後に廃止され、2021年からは性別のない主演俳優賞・助演俳優賞に再編された。',
    role: 'actor',
  },
  {
    slug: 'berlin-best-leading-performance',
    ...berlin,
    categoryNames: ['Silver Bear for Best Leading Performance'],
    name: '銀熊賞（主演俳優賞）',
    categoryLabel: '銀熊賞（主演俳優賞）',
    description:
      'ベルリン国際映画祭 銀熊賞（主演俳優賞）の歴代受賞者の一覧。2021年に男優賞・女優賞を統合して新設された性別のない演技賞。',
    role: 'actor',
  },
  {
    slug: 'berlin-best-supporting-performance',
    ...berlin,
    categoryNames: ['Silver Bear for Best Supporting Performance'],
    name: '銀熊賞（助演俳優賞）',
    categoryLabel: '銀熊賞（助演俳優賞）',
    description:
      'ベルリン国際映画祭 銀熊賞（助演俳優賞）の歴代受賞者の一覧。2021年に新設された性別のない演技賞。',
    role: 'actor',
  },
];
