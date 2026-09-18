import {describe, expect, it} from 'vitest';
import {filterCeremonies, organizationOptions} from './ceremony-list';
import type {CeremonyListItem} from './types';

const createCeremony = (
  overrides: Partial<CeremonyListItem> & Pick<CeremonyListItem, 'uid'>,
): CeremonyListItem => ({
  organizationUid: 'org-1',
  organizationName: 'アカデミー賞',
  organizationCountry: null,
  year: 2024,
  ceremonyNumber: null,
  startDate: null,
  endDate: null,
  location: null,
  description: null,
  createdAt: 0,
  updatedAt: 0,
  movieCount: 0,
  imdbEventUrl: null,
  ...overrides,
});

describe('filterCeremonies', () => {
  const ceremonies = [
    createCeremony({uid: 'a', organizationName: 'アカデミー賞', year: 2024}),
    createCeremony({
      uid: 'b',
      organizationUid: 'org-2',
      organizationName: 'Venice Film Festival',
      location: 'Venice',
      year: 2023,
    }),
  ];

  it('条件がなければすべて返す', () => {
    expect(filterCeremonies(ceremonies, '', '')).toHaveLength(2);
  });

  it('団体名で絞り込む', () => {
    expect(filterCeremonies(ceremonies, 'アカデミー', '')).toEqual([
      ceremonies[0],
    ]);
  });

  it('団体名の大文字小文字は区別しない', () => {
    expect(filterCeremonies(ceremonies, 'venice film', '')).toEqual([
      ceremonies[1],
    ]);
  });

  it('開催場所で絞り込む', () => {
    expect(filterCeremonies(ceremonies, 'venice', '')).toEqual([ceremonies[1]]);
  });

  it('開催年で絞り込む', () => {
    expect(filterCeremonies(ceremonies, '2023', '')).toEqual([ceremonies[1]]);
  });

  it('主催団体で絞り込む', () => {
    expect(filterCeremonies(ceremonies, '', 'org-2')).toEqual([ceremonies[1]]);
  });

  it('キーワードと主催団体の両方を満たすものだけ返す', () => {
    expect(filterCeremonies(ceremonies, '2024', 'org-2')).toEqual([]);
  });
});

describe('organizationOptions', () => {
  it('同じ団体は1つにまとめる', () => {
    const options = organizationOptions([
      createCeremony({uid: 'a'}),
      createCeremony({uid: 'b'}),
    ]);

    expect(options).toEqual([{value: 'org-1', label: 'アカデミー賞'}]);
  });

  it('団体名の日本語の並びで返す', () => {
    const options = organizationOptions([
      createCeremony({
        uid: 'a',
        organizationUid: 'org-3',
        organizationName: 'ヨコハマ映画祭',
      }),
      createCeremony({
        uid: 'b',
        organizationUid: 'org-1',
        organizationName: 'アカデミー賞',
      }),
      createCeremony({
        uid: 'c',
        organizationUid: 'org-2',
        organizationName: 'カンヌ国際映画祭',
      }),
    ]);

    expect(options.map(option => option.label)).toEqual([
      'アカデミー賞',
      'カンヌ国際映画祭',
      'ヨコハマ映画祭',
    ]);
  });
});
