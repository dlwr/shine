import {describe, expect, it} from 'vitest';
import {
  japanAcademyCeremonyNumber,
  japanAcademyFilmReferences,
  toImdbEventData,
} from '../japan-academy-awards';
import {type JapanAcademyEdition} from '../japan-academy-wikitext';
import {type ResolvedFilm} from '../common/wikidata-film-resolver';

const editions: JapanAcademyEdition[] = [
  {
    year: 1977,
    ceremonyNumber: 1,
    films: [
      {
        page: '幸福の黄色いハンカチ',
        title: '幸福の黄色いハンカチ',
        isWinner: true,
      },
      {page: '青春の門', title: '青春の門・自立篇', isWinner: false},
      {page: '竹山ひとり旅', title: '竹山ひとり旅', isWinner: false},
    ],
  },
];

const resolved = new Map<string, ResolvedFilm>([
  [
    '幸福の黄色いハンカチ',
    {imdbId: 'tt0076218', englishTitle: 'The Yellow Handkerchief'},
  ],
  ['青春の門', {imdbId: 'tt0076744'}],
]);

describe('japanAcademyCeremonyNumber', () => {
  it('1978年の授賞式が第1回', () => {
    expect(japanAcademyCeremonyNumber(1978)).toBe(1);
  });

  it('2026年の授賞式が第49回', () => {
    expect(japanAcademyCeremonyNumber(2026)).toBe(49);
  });
});

describe('japanAcademyFilmReferences', () => {
  it('記事名をキーにする', () => {
    expect(japanAcademyFilmReferences(editions).map(r => r.key)).toEqual([
      '幸福の黄色いハンカチ',
      '青春の門',
      '竹山ひとり旅',
    ]);
  });

  it('対象年は作品の公開年', () => {
    expect(japanAcademyFilmReferences(editions).map(r => r.targetYear)).toEqual(
      [1977, 1977, 1977],
    );
  });
});

describe('toImdbEventData', () => {
  it('授賞式の年に変換する', () => {
    const data = toImdbEventData(editions, resolved, '2026-08-19');

    expect(data.editions.map(edition => edition.year)).toEqual([1978]);
  });

  it('同定できた作品だけをノミネートにする', () => {
    const data = toImdbEventData(editions, resolved, '2026-08-19');
    const nominations =
      data.editions[0].targetAward[0].categories[0].nominations;

    expect(nominations.map(n => n.titles[0].imdbId)).toEqual([
      'tt0076218',
      'tt0076744',
    ]);
  });

  it('最優秀賞を受賞として扱う', () => {
    const data = toImdbEventData(editions, resolved, '2026-08-19');
    const nominations =
      data.editions[0].targetAward[0].categories[0].nominations;

    expect(nominations.map(n => n.isWinner)).toEqual([true, false]);
  });

  it('英題があれば原題として渡す', () => {
    const data = toImdbEventData(editions, resolved, '2026-08-19');
    const [first] = data.editions[0].targetAward[0].categories[0].nominations;

    expect(first.titles[0]).toEqual({
      imdbId: 'tt0076218',
      title: '幸福の黄色いハンカチ',
      originalTitle: 'The Yellow Handkerchief',
    });
  });
});
