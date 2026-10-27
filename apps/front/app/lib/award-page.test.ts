import {describe, expect, it} from 'vitest';
import {
  awardLeadText,
  awardPagePath,
  awardPageTitle,
  awardSummaryLine,
  buildAwardItemList,
  type AwardDetailData,
  type PersonAwardDetailData,
} from './award-page';

const movie = (uid: string) => ({
  uid,
  title: uid,
  isWinner: true,
  availabilityStatus: 'watchable' as const,
});

const availabilitySummary = {
  total: 0,
  watchable: 0,
  rentalOnly: 0,
  unwatchable: 0,
  unchecked: 0,
};

const yearAward: AwardDetailData = {
  slug: 'palme-dor',
  name: 'パルム・ドール',
  organization: 'カンヌ国際映画祭',
  description: '',
  grouping: 'year',
  availabilitySummary,
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
  availabilitySummary,
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
    expect(awardSummaryLine(yearAward)).toBe('2021–2023 受賞 2 本・全 63 本');
  });

  it('リスト型は作品数だけを出す', () => {
    expect(awardSummaryLine(listAward)).toBe('全 3 本');
  });

  it('個人賞は受賞者数とノミネート数を出す', () => {
    expect(awardSummaryLine(personAward)).toBe(
      '1990–1991 受賞 2 人・ノミネート 3 人',
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

describe('awardLeadText', () => {
  it('年度制は最新の受賞作を回次つきで出す', () => {
    const award = {
      ...yearAward,
      years: [
        {year: 2024, ceremonyNumber: 77, filmCount: 22, movies: []},
        ...yearAward.years,
      ],
    };

    expect(awardLeadText(award)).toContain(
      '最新の受賞作は2023年の『m-2023』。',
    );
  });

  it('回次があれば添える', () => {
    const award = {
      ...yearAward,
      years: [
        {
          year: 2023,
          ceremonyNumber: 76,
          filmCount: 21,
          movies: [movie('m-2023')],
        },
      ],
    };

    expect(awardLeadText(award)).toContain('第76回（2023年）の『m-2023』');
  });

  it('年度制は収録範囲と受賞作の本数を出す', () => {
    expect(awardLeadText(yearAward)).toContain(
      '2021年から2023年までの受賞作2本を収録。',
    );
  });

  it('日本で観られる本数を出す', () => {
    const award = {
      ...yearAward,
      availabilitySummary: {...availabilitySummary, total: 63, watchable: 20},
    };

    expect(awardLeadText(award)).toContain(
      '候補作を含む63本のうち20本が日本で観られます。',
    );
  });

  it('観られるかの確認が1本も無ければ本数を出さない', () => {
    expect(awardLeadText(yearAward)).not.toContain('日本で観られます');
  });

  it('個人賞は最新の受賞者を出す', () => {
    expect(awardLeadText(personAward)).toContain(
      '最新の受賞者は1991年の監督A。',
    );
  });

  it('個人賞は受賞者とノミネートの人数を出す', () => {
    expect(awardLeadText(personAward)).toContain(
      '1990年から1991年までの受賞者2人とノミネート3人を収録。',
    );
  });

  it('リスト型は出さない', () => {
    expect(awardLeadText(listAward)).toBeUndefined();
  });
});
