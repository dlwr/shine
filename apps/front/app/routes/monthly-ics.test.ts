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

describe('monthly.ics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('月替わりの履歴を 12 か月分取りに行く', async () => {
    mockHistory(history);

    await loader(createArguments());

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      '/selections/monthly/history?locale=ja&limit=12',
    );
  });

  it('text/calendar で返す', async () => {
    mockHistory(history);

    const response = await loader(createArguments());

    expect(response.headers.get('Content-Type')).toBe(
      'text/calendar; charset=utf-8',
    );
  });

  it('履歴の映画を予定として返す', async () => {
    mockHistory(history);

    const response = await loader(createArguments());
    const body = await response.text();

    expect(body).toContain('UID:monthly-2026-09@shine-film.com');
  });

  it('履歴が取れなければ 502 を返す', async () => {
    mockHistory({}, false);

    const response = await loader(createArguments());

    expect(response.status).toBe(502);
  });
});
