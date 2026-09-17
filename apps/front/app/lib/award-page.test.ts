import {describe, expect, it} from 'vitest';
import {
  awardPagePath,
  awardPageTitle,
  awardSummaryLine,
  buildAwardItemList,
  type AwardDetailData,
  type PersonAwardDetailData,
} from './award-page';

const movie = (uid: string) => ({uid, title: uid, isWinner: true});

const yearAward: AwardDetailData = {
  slug: 'palme-dor',
  name: 'パルム・ドール',
  organization: 'カンヌ国際映画祭',
  description: '',
  grouping: 'year',
  years: [
    {year: 2023, filmCount: 21, movies: [movie('m-2023')]},
    {year: 2022, filmCount: 18, movies: [movie('m-2022')]},
    {year: 2021, filmCount: 24, movies: []},
  ],
};

const listAward: AwardDetailData = {
  slug: 'popeye-21st-century',
  name: 'POPEYE',
  organization: 'POPEYE',
  description: '',
  grouping: 'list',
  years: [
    {year: 2025, filmCount: 3, movies: [movie('a'), movie('b'), movie('c')]},
  ],
  pagination: {page: 2, perPage: 50, totalCount: 103, totalPages: 3},
};

const personAward: PersonAwardDetailData = {
  slug: 'japan-academy-director',
  name: '最優秀監督賞',
  organization: '日本アカデミー賞',
  description: '',
  grouping: 'person',
  years: [
    {
      year: 1991,
      nominees: [
        {
          uid: 'p-1',
          name: '監督A',
          originalName: '監督A',
          isWinner: true,
          movies: [],
        },
        {
          uid: 'p-2',
          name: '監督B',
          originalName: '監督B',
          isWinner: false,
          movies: [],
        },
      ],
    },
    {
      year: 1990,
      nominees: [
        {
          uid: 'p-3',
          name: '監督C',
          originalName: '監督C',
          isWinner: true,
          movies: [],
        },
      ],
    },
  ],
};

describe('awardPagePath', () => {
  it('1ページ目は page を付けない', () => {
    expect(awardPagePath(yearAward)).toBe('/awards/palme-dor');
  });

  it('2ページ目以降は page を付ける', () => {
    expect(awardPagePath(listAward)).toBe('/awards/popeye-21st-century?page=2');
  });
});

describe('awardPageTitle', () => {
  it('リスト型は作品数とページ番号を出す', () => {
    expect(awardPageTitle(listAward)).toBe(
      'POPEYE 全3作品（2ページ目） | SHINE',
    );
  });
});

describe('awardSummaryLine', () => {
  it('年度制は受賞作数と出品作数を出す', () => {
    expect(awardSummaryLine(yearAward)).toBe(
      '2021–2023 / 2 WINNERS / 63 FILMS',
    );
  });

  it('リスト型は作品数だけを出す', () => {
    expect(awardSummaryLine(listAward)).toBe('3 FILMS');
  });

  it('個人賞は受賞者数とノミネート数を出す', () => {
    expect(awardSummaryLine(personAward)).toBe(
      '1990–1991 / 2 WINNERS / 3 NOMINEES',
    );
  });
});

describe('buildAwardItemList', () => {
  it('ページ送りの位置から番号を振る', () => {
    const list = buildAwardItemList(listAward) as {
      itemListElement: Array<{position: number}>;
    };

    expect(list.itemListElement.map(item => item.position)).toEqual([
      51, 52, 53,
    ]);
  });

  it('個人賞は受賞者だけを人物ページで並べる', () => {
    const list = buildAwardItemList(personAward) as {
      itemListElement: Array<{url: string}>;
    };

    expect(list.itemListElement.map(item => item.url)).toEqual([
      'https://shine-film.com/people/p-1',
      'https://shine-film.com/people/p-3',
    ]);
  });
});
