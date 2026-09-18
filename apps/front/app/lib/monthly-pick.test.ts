import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createEnvironmentContext} from './api';
import {
  fetchMonthlyPick,
  monthlyPickCacheSeconds,
  monthlyPickLabel,
} from './monthly-pick';

const context = createEnvironmentContext({
  PUBLIC_API_URL: 'https://api.example',
});

describe('fetchMonthlyPick', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('選出 API から今月の1本を uid・題名・年・ポスターに絞って返す', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        monthly: {
          uid: 'm1',
          year: 2023,
          translations: [
            {languageCode: 'en', content: 'Original', isDefault: 1},
            {languageCode: 'ja', content: '邦題', isDefault: 0},
          ],
          posterUrls: [
            {url: 'https://img/en.jpg', languageCode: 'en', isPrimary: 1},
            {url: 'https://img/ja.jpg', languageCode: 'ja', isPrimary: 0},
          ],
          nominations: [
            {
              isWinner: false,
              category: {name: 'Golden Lion', displayName: '金獅子賞'},
              ceremony: {year: 2026},
              organization: {
                name: 'Venice Film Festival',
                shortName: 'Venice',
                displayName: 'ヴェネツィア国際映画祭',
                slug: 'venice-golden-lion',
              },
            },
            {
              isWinner: true,
              category: {name: 'Best Picture'},
              ceremony: {year: 2024},
              organization: {name: 'Some Circle', shortName: 'Circle'},
            },
          ],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pick = await fetchMonthlyPick(context, 'ja');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/?locale=ja',
      expect.anything(),
    );
    expect(pick).toEqual({
      uid: 'm1',
      title: '邦題',
      year: 2023,
      posterUrl: 'https://img/ja.jpg',
      awards: [
        {
          organization: 'ヴェネツィア国際映画祭',
          category: '金獅子賞',
          year: 2026,
          isWinner: false,
          slug: 'venice-golden-lion',
        },
        {
          organization: 'Circle',
          category: 'Best Picture',
          year: 2024,
          isWinner: true,
        },
      ],
    });
  });

  it('ポスターが無ければ posterUrl を持たない', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          monthly: {uid: 'm1', year: 2023, title: 'Bare', posterUrls: []},
        }),
      ),
    );

    const pick = await fetchMonthlyPick(context, 'en');

    expect(pick).toEqual({uid: 'm1', title: 'Bare', year: 2023, awards: []});
  });

  it('API が失敗したら undefined を返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', {status: 500})),
    );

    expect(await fetchMonthlyPick(context, 'ja')).toBeUndefined();
  });

  it('fetch が例外を投げても undefined を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));

    expect(await fetchMonthlyPick(context, 'ja')).toBeUndefined();
  });

  it('monthly が無ければ undefined を返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({daily: {}})),
    );

    expect(await fetchMonthlyPick(context, 'ja')).toBeUndefined();
  });
});

describe('monthlyPickLabel', () => {
  it('日本語では年と月で今月の1本を表す', () => {
    expect(monthlyPickLabel(new Date('2026-09-18T05:00:00Z'), 'ja')).toBe(
      '2026年9月の1本',
    );
  });

  it('英語では月名と年で表す', () => {
    expect(monthlyPickLabel(new Date('2026-09-18T05:00:00Z'), 'en')).toBe(
      'September 2026 pick',
    );
  });

  it('月の変わり目は選出と同じ UTC で判定する', () => {
    expect(monthlyPickLabel(new Date('2026-09-30T23:59:59Z'), 'ja')).toBe(
      '2026年9月の1本',
    );
    expect(monthlyPickLabel(new Date('2026-10-01T00:00:00Z'), 'ja')).toBe(
      '2026年10月の1本',
    );
  });
});

describe('monthlyPickCacheSeconds', () => {
  it('月の残りが1時間より長ければ1時間で頭打ちにする', () => {
    expect(monthlyPickCacheSeconds(new Date('2026-09-18T05:00:00Z'))).toBe(
      3600,
    );
  });

  it('月末が近ければ次の月の1日までにする', () => {
    expect(monthlyPickCacheSeconds(new Date('2026-09-30T23:50:00Z'))).toBe(600);
  });

  it('月が切り替わる瞬間は0にする', () => {
    expect(monthlyPickCacheSeconds(new Date('2026-09-30T23:59:59Z'))).toBe(1);
    expect(monthlyPickCacheSeconds(new Date('2026-10-01T00:00:00Z'))).toBe(
      3600,
    );
  });

  it('年をまたぐ月末でも次の月の1日を求める', () => {
    expect(monthlyPickCacheSeconds(new Date('2026-12-31T23:30:00Z'))).toBe(
      1800,
    );
  });
});
