import {describe, expect, it} from 'vitest';
import {
  formatCeremonyLabel,
  formatOrganizationLabel,
  sortCategoriesByName,
  sortCeremoniesByYearDesc,
} from './format';

const ceremony = (
  uid: string,
  year: number,
  ceremonyNumber: number | null,
) => ({
  uid,
  organizationUid: 'org-1',
  year,
  ceremonyNumber,
  organizationName: '日本アカデミー賞',
  imdbEventUrl: null,
});

const category = (uid: string, name: string) => ({
  uid,
  organizationUid: 'org-1',
  name,
  organizationName: '日本アカデミー賞',
});

describe('sortCeremoniesByYearDesc', () => {
  it('年の新しい順に並べる', () => {
    const sorted = sortCeremoniesByYearDesc([
      ceremony('c-2022', 2022, 45),
      ceremony('c-2024', 2024, 47),
      ceremony('c-2023', 2023, 46),
    ]);

    expect(sorted.map(item => item.uid)).toEqual([
      'c-2024',
      'c-2023',
      'c-2022',
    ]);
  });

  it('元の配列を変更しない', () => {
    const ceremonies = [
      ceremony('c-2022', 2022, 45),
      ceremony('c-2024', 2024, 47),
      ceremony('c-2023', 2023, 46),
    ];

    sortCeremoniesByYearDesc(ceremonies);

    expect(ceremonies.map(item => item.uid)).toEqual([
      'c-2022',
      'c-2024',
      'c-2023',
    ]);
  });
});

describe('sortCategoriesByName', () => {
  it('部門名の五十音順に並べる', () => {
    const sorted = sortCategoriesByName([
      category('c-3', 'サウンド賞'),
      category('c-1', 'アニメーション賞'),
      category('c-2', 'カメラ賞'),
    ]);

    expect(sorted.map(item => item.name)).toEqual([
      'アニメーション賞',
      'カメラ賞',
      'サウンド賞',
    ]);
  });
});

describe('formatOrganizationLabel', () => {
  it('略称と国を付ける', () => {
    expect(
      formatOrganizationLabel({
        uid: 'org-1',
        name: '日本アカデミー賞',
        shortName: 'JAA',
        country: 'Japan',
      }),
    ).toBe('日本アカデミー賞 (JAA) - Japan');
  });

  it('略称が空白なら付けない', () => {
    expect(
      formatOrganizationLabel({
        uid: 'org-1',
        name: '日本アカデミー賞',
        shortName: ' ',
        country: 'Japan',
      }),
    ).toBe('日本アカデミー賞 - Japan');
  });

  it('国が無ければ付けない', () => {
    expect(
      formatOrganizationLabel({
        uid: 'org-1',
        name: '日本アカデミー賞',
        shortName: 'JAA',
        country: null,
      }),
    ).toBe('日本アカデミー賞 (JAA)');
  });
});

describe('formatCeremonyLabel', () => {
  it('年と回を並べる', () => {
    expect(formatCeremonyLabel(ceremony('c-2024', 2024, 47))).toBe(
      '2024年 / 第47回',
    );
  });

  it('回が無ければ年だけにする', () => {
    expect(formatCeremonyLabel(ceremony('c-2024', 2024, null))).toBe('2024年');
  });
});
