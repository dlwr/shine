import {academyAwards, bafta, goldenGlobe} from './organizations';
import type {PersonAwardDefinition} from './types';

export const overseasPersonAwardDefinitions: PersonAwardDefinition[] = [
  {
    slug: 'academy-director',
    ...academyAwards,
    categoryNames: ['Academy Award for Best Director'],
    name: '監督賞',
    categoryLabel: '監督賞',
    description:
      'アカデミー賞（オスカー）監督賞の歴代受賞者とノミネートの一覧。',
    role: 'director',
  },
  {
    slug: 'academy-lead-actor',
    ...academyAwards,
    categoryNames: ['Academy Award for Best Actor'],
    name: '主演男優賞',
    categoryLabel: '主演男優賞',
    description:
      'アカデミー賞（オスカー）主演男優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'academy-lead-actress',
    ...academyAwards,
    categoryNames: ['Academy Award for Best Actress'],
    name: '主演女優賞',
    categoryLabel: '主演女優賞',
    description:
      'アカデミー賞（オスカー）主演女優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'academy-supporting-actor',
    ...academyAwards,
    categoryNames: ['Academy Award for Best Supporting Actor'],
    name: '助演男優賞',
    categoryLabel: '助演男優賞',
    description:
      'アカデミー賞（オスカー）助演男優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'academy-supporting-actress',
    ...academyAwards,
    categoryNames: ['Academy Award for Best Supporting Actress'],
    name: '助演女優賞',
    categoryLabel: '助演女優賞',
    description:
      'アカデミー賞（オスカー）助演女優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'bafta-director',
    ...bafta,
    categoryNames: ['BAFTA Award for Best Direction'],
    name: '監督賞',
    categoryLabel: '監督賞',
    description:
      '英国アカデミー賞（BAFTA）監督賞の歴代受賞者とノミネートの一覧。',
    role: 'director',
  },
  {
    slug: 'bafta-lead-actor',
    ...bafta,
    categoryNames: ['BAFTA Award for Best Actor in a Leading Role'],
    name: '主演男優賞',
    categoryLabel: '主演男優賞',
    description:
      '英国アカデミー賞（BAFTA）主演男優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'bafta-lead-actress',
    ...bafta,
    categoryNames: ['BAFTA Award for Best Actress in a Leading Role'],
    name: '主演女優賞',
    categoryLabel: '主演女優賞',
    description:
      '英国アカデミー賞（BAFTA）主演女優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'bafta-supporting-actor',
    ...bafta,
    categoryNames: ['BAFTA Award for Best Actor in a Supporting Role'],
    name: '助演男優賞',
    categoryLabel: '助演男優賞',
    description:
      '英国アカデミー賞（BAFTA）助演男優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'bafta-supporting-actress',
    ...bafta,
    categoryNames: ['BAFTA Award for Best Actress in a Supporting Role'],
    name: '助演女優賞',
    categoryLabel: '助演女優賞',
    description:
      '英国アカデミー賞（BAFTA）助演女優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'golden-globe-director',
    ...goldenGlobe,
    categoryNames: ['Golden Globe Award for Best Director'],
    name: '監督賞',
    categoryLabel: '監督賞',
    description: 'ゴールデングローブ賞 監督賞の歴代受賞者とノミネートの一覧。',
    role: 'director',
  },
  {
    slug: 'golden-globe-lead-actor-drama',
    ...goldenGlobe,
    categoryNames: [
      'Golden Globe Award for Best Actor in a Motion Picture – Drama',
    ],
    name: '主演男優賞（ドラマ部門）',
    categoryLabel: '主演男優賞（ドラマ部門）',
    description:
      'ゴールデングローブ賞 主演男優賞（ドラマ部門）の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'golden-globe-lead-actor-musical-comedy',
    ...goldenGlobe,
    categoryNames: [
      'Golden Globe Award for Best Actor in a Motion Picture – Musical or Comedy',
    ],
    name: '主演男優賞（ミュージカル・コメディ部門）',
    categoryLabel: '主演男優賞（ミュージカル・コメディ部門）',
    description:
      'ゴールデングローブ賞 主演男優賞（ミュージカル・コメディ部門）の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'golden-globe-lead-actress-drama',
    ...goldenGlobe,
    categoryNames: [
      'Golden Globe Award for Best Actress in a Motion Picture – Drama',
    ],
    name: '主演女優賞（ドラマ部門）',
    categoryLabel: '主演女優賞（ドラマ部門）',
    description:
      'ゴールデングローブ賞 主演女優賞（ドラマ部門）の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'golden-globe-lead-actress-musical-comedy',
    ...goldenGlobe,
    categoryNames: [
      'Golden Globe Award for Best Actress in a Motion Picture – Musical or Comedy',
    ],
    name: '主演女優賞（ミュージカル・コメディ部門）',
    categoryLabel: '主演女優賞（ミュージカル・コメディ部門）',
    description:
      'ゴールデングローブ賞 主演女優賞（ミュージカル・コメディ部門）の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'golden-globe-supporting-actor',
    ...goldenGlobe,
    categoryNames: [
      'Golden Globe Award for Best Supporting Actor – Motion Picture',
    ],
    name: '助演男優賞',
    categoryLabel: '助演男優賞',
    description:
      'ゴールデングローブ賞 助演男優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
  {
    slug: 'golden-globe-supporting-actress',
    ...goldenGlobe,
    categoryNames: [
      'Golden Globe Award for Best Supporting Actress – Motion Picture',
    ],
    name: '助演女優賞',
    categoryLabel: '助演女優賞',
    description:
      'ゴールデングローブ賞 助演女優賞の歴代受賞者とノミネートの一覧。',
    role: 'actor',
  },
];
