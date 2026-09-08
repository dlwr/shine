import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createEnvironmentContext} from './api';
import {fetchMonthlyPick} from './monthly-pick';

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
          nominations: [],
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

    expect(pick).toEqual({uid: 'm1', title: 'Bare', year: 2023});
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
