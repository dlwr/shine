import {describe, expect, it} from 'vitest';
import {nextAwards} from './next-awards';
import type {AwardSummaryData} from './api-types';

const award = (
  slug: string,
  organization: string,
  grouping: AwardSummaryData['grouping'] = 'year',
): AwardSummaryData => ({
  slug,
  name: slug,
  organization,
  description: '',
  grouping,
  movieCount: 10,
  firstYear: 2000,
  lastYear: 2026,
});

const awards = [
  award('palme-dor', 'カンヌ国際映画祭'),
  award('cannes-grand-prix', 'カンヌ国際映画祭'),
  award('academy-best-picture', 'アカデミー賞'),
  award('japan-academy-best-picture', '日本アカデミー賞'),
  award('kinema-junpo-japanese', 'キネマ旬報'),
  award('1001-movies', '1001', 'list'),
  award('japan-academy-director', '日本アカデミー賞', 'person'),
  award('japan-academy-lead-actor', '日本アカデミー賞', 'person'),
  award('academy-director', 'アカデミー賞', 'person'),
];

const slugs = (list: AwardSummaryData[]) => list.map(a => a.slug);

describe('nextAwards', () => {
  it('同じ団体の他の賞を出す', () => {
    expect(
      slugs(nextAwards('japan-academy-best-picture', awards).sameOrganization),
    ).toEqual(['japan-academy-director', 'japan-academy-lead-actor']);
  });

  it('他の団体からは同じ種類の賞を団体ごとに1つ出す', () => {
    expect(
      slugs(
        nextAwards('japan-academy-best-picture', awards).otherOrganizations,
      ),
    ).toEqual(['kinema-junpo-japanese', 'palme-dor', 'academy-best-picture']);
  });

  it('海外の賞からは海外の賞を先に出す', () => {
    expect(slugs(nextAwards('palme-dor', awards).otherOrganizations)).toEqual([
      'academy-best-picture',
      'japan-academy-best-picture',
      'kinema-junpo-japanese',
    ]);
  });

  it('個人賞からは他の団体の同じ部門を選ぶ', () => {
    const personAwards = [
      award('japan-academy-lead-actor', '日本アカデミー賞', 'person'),
      award('kinema-junpo-director', 'キネマ旬報', 'person'),
      award('kinema-junpo-lead-actor', 'キネマ旬報', 'person'),
      award('academy-director', 'アカデミー賞', 'person'),
      award('academy-lead-actor', 'アカデミー賞', 'person'),
      award('yokohama-director', 'ヨコハマ映画祭', 'person'),
    ];

    expect(
      slugs(
        nextAwards('japan-academy-lead-actor', personAwards).otherOrganizations,
      ),
    ).toEqual([
      'kinema-junpo-lead-actor',
      'yokohama-director',
      'academy-lead-actor',
    ]);
  });

  it('個人賞からは他の団体の個人賞を出す', () => {
    expect(
      slugs(nextAwards('japan-academy-director', awards).otherOrganizations),
    ).toEqual(['academy-director']);
  });

  it('一覧に無い賞なら何も出さない', () => {
    expect(nextAwards('unknown', awards)).toEqual({
      sameOrganization: [],
      otherOrganizations: [],
    });
  });
});
