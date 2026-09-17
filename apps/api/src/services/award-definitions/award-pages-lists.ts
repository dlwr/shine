import type {AwardPageDefinition} from './types';

export const listAwardPageDefinitions: AwardPageDefinition[] = [
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
