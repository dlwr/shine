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
  award('palme-dor', 'カンヌ'),
  award('cannes-grand-prix', 'カンヌ'),
  award('academy-best-picture', 'アカデミー'),
  award('japan-academy-best-picture', '日本アカデミー'),
  award('kinema-junpo-japanese', 'キネマ旬報'),
  award('1001-movies', '1001', 'list'),
  award('japan-academy-director', '日本アカデミー', 'person'),
  award('japan-academy-lead-actor', '日本アカデミー', 'person'),
  award('academy-director', 'アカデミー', 'person'),
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
    ).toEqual(['palme-dor', 'academy-best-picture', 'kinema-junpo-japanese']);
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
