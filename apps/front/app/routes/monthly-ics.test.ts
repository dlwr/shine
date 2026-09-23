import {beforeEach, describe, expect, it, vi} from 'vitest';
import {loader} from './monthly-ics';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const createArguments = () =>
  ({
    context: createMockContext(),
    request: new Request('https://shine-film.com/monthly.ics'),
    params: {},
  }) as unknown as Parameters<typeof loader>[0];

const mockHistory = (body: unknown, isOk = true) => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: isOk,
    json: async () => body,
  } as Response);
};

const history = {
  items: [
    {
      uid: 'movie-9',
      title: 'ぬいぐるみとしゃべる人はやさしい',
      year: 2023,
      selectionDate: '2026-09-01',
    },
  ],
};

const next = {
  date: '2026-10-01',
  movie: {uid: 'movie-10', title: '来月の映画', year: 1999},
};

describe('monthly.ics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('月替わりの履歴を 12 か月分取りに行く', async () => {
    mockHistory(history);
    mockHistory(next);

    await loader(createArguments());

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      '/selections/monthly/history?locale=ja&limit=12',
    );
  });

  it('来月の1本も取りに行く', async () => {
    mockHistory(history);
    mockHistory(next);

    await loader(createArguments());

    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain(
      '/selections/monthly/next?locale=ja',
    );
  });

  it('text/calendar で返す', async () => {
    mockHistory(history);
    mockHistory(next);

    const response = await loader(createArguments());

    expect(response.headers.get('Content-Type')).toBe(
      'text/calendar; charset=utf-8',
    );
  });

  it('履歴の映画を予定として返す', async () => {
    mockHistory(history);
    mockHistory(next);

    const response = await loader(createArguments());
    const body = await response.text();

    expect(body).toContain('UID:monthly-2026-09@shine-film.com');
  });

  it('来月の1本を来月の予定として返す', async () => {
    mockHistory(history);
    mockHistory(next);

    const response = await loader(createArguments());
    const body = await response.text();

    expect(body).toContain('UID:monthly-2026-10@shine-film.com');
    expect(body).toContain('来月の映画');
  });

  it('来月の1本が取れなければ履歴だけを返す', async () => {
    mockHistory(history);
    mockHistory({}, false);

    const response = await loader(createArguments());
    const body = await response.text();

    expect(body).toContain('UID:monthly-2026-09@shine-film.com');
    expect(body).not.toContain('2026-10');
  });

  it('履歴が取れなければ 502 を返す', async () => {
    mockHistory({}, false);
    mockHistory(next);

    await expect(loader(createArguments())).rejects.toMatchObject({
      status: 502,
    });
  });
});
