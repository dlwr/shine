import '@testing-library/jest-dom';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import AdminCeremonies, {loader, meta} from './admin.ceremonies';
import type {Route} from './+types/admin.ceremonies';
import {createMockContext} from '@/lib/test-context';

vi.mock('@/components/admin-nav', () => ({
  default: () => <nav data-testid="admin-nav" />,
}));

const cast = <T,>(value: unknown): T => value as T;

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

vi.stubGlobal('localStorage', mockLocalStorage);

const mockLocation = {
  href: '',
  assign(url: string) {
    mockLocation.href = url;
  },
};

Object.defineProperty(globalThis, 'location', {
  value: mockLocation,
  writable: true,
});

const ceremonyList = [
  {
    uid: 'ceremony-1',
    organizationUid: 'org-academy',
    organizationName: 'アカデミー賞',
    organizationCountry: 'United States',
    year: 2024,
    ceremonyNumber: 96,
    startDate: 1_710_000_000,
    endDate: 1_710_086_400,
    location: 'ロサンゼルス',
    description: null,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    movieCount: 12,
    imdbEventUrl: 'https://www.imdb.com/event/ev0000003/2024/1',
  },
  {
    uid: 'ceremony-2',
    organizationUid: 'org-venice',
    organizationName: 'ヴェネツィア国際映画祭',
    organizationCountry: 'Italy',
    year: 2023,
    ceremonyNumber: null,
    startDate: null,
    endDate: null,
    location: null,
    description: null,
    createdAt: 1_690_000_000,
    updatedAt: 1_690_000_000,
    movieCount: 0,
    imdbEventUrl: null,
  },
  {
    uid: 'ceremony-3',
    organizationUid: 'org-academy',
    organizationName: 'アカデミー賞',
    organizationCountry: 'United States',
    year: 2022,
    ceremonyNumber: 94,
    startDate: null,
    endDate: null,
    location: 'ロサンゼルス',
    description: null,
    createdAt: 1_650_000_000,
    updatedAt: 1_650_000_000,
    movieCount: 5,
    imdbEventUrl: null,
  },
];

const renderPage = () =>
  render(
    <AdminCeremonies
      loaderData={{apiUrl: 'http://localhost:8787'}}
      params={cast<Route.ComponentProps['params']>({})}
      matches={cast<Route.ComponentProps['matches']>([])}
    />,
  );

const respondWith = (
  body: unknown,
  init: {ok?: boolean; status?: number} = {},
) => {
  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  fetchMock.mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    async json() {
      return body;
    },
  });
};

beforeEach(() => {
  vi.resetAllMocks();
  mockLocalStorage.getItem.mockReturnValue('admin-token');
  vi.stubGlobal('fetch', vi.fn());
  mockLocation.href = '';
});

describe('meta', () => {
  it('タイトルを返す', () => {
    expect(meta()).toContainEqual({title: 'セレモニー一覧 | Shine Admin'});
  });
});

describe('loader', () => {
  it('apiUrlを返す', async () => {
    const result = await loader(
      cast<Route.LoaderArgs>({context: createMockContext()}),
    );

    expect(result.apiUrl).toBe('http://localhost:8787');
  });
});

describe('AdminCeremonies', () => {
  it('管理APIのセレモニー一覧を取得する', async () => {
    respondWith({ceremonies: ceremonyList});
    renderPage();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8787/admin/ceremonies',
        expect.anything(),
      );
    });
  });

  it('取得前は読み込み中を表示する', () => {
    respondWith({ceremonies: ceremonyList});
    renderPage();

    expect(screen.getByText('読み込み中です…')).toBeInTheDocument();
  });

  it('回次があるセレモニーは年と回次を表示する', async () => {
    respondWith({ceremonies: ceremonyList});
    renderPage();

    expect(await screen.findByText('2024年（第96回）')).toBeInTheDocument();
  });

  it('回次がないセレモニーは年だけを表示する', async () => {
    respondWith({ceremonies: ceremonyList});
    renderPage();

    expect(await screen.findByText('2023年')).toBeInTheDocument();
  });

  it('開始日と終了日があれば期間を表示する', async () => {
    respondWith({ceremonies: ceremonyList});
    renderPage();

    const start = new Date(1_710_000_000 * 1000).toLocaleDateString('ja-JP');
    const end = new Date(1_710_086_400 * 1000).toLocaleDateString('ja-JP');
    expect(await screen.findByText(`${start} 〜 ${end}`)).toBeInTheDocument();
  });

  it('開催日がなければ期間をハイフンで表示する', async () => {
    respondWith({ceremonies: [ceremonyList[1]]});
    renderPage();

    await screen.findByText('2023年');
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('IMDbイベントURLがあればリンクを表示する', async () => {
    respondWith({ceremonies: ceremonyList});
    renderPage();

    const link = await screen.findByRole('link', {name: 'IMDb'});
    expect(link).toHaveAttribute(
      'href',
      'https://www.imdb.com/event/ev0000003/2024/1',
    );
  });

  it('編集リンクはセレモニーの詳細ページを指す', async () => {
    respondWith({ceremonies: [ceremonyList[0]]});
    renderPage();

    const link = await screen.findByRole('link', {name: '編集'});
    expect(link).toHaveAttribute('href', '/admin/ceremonies/ceremony-1');
  });

  it('主催団体の選択肢は重複を除いて名前順に並ぶ', async () => {
    respondWith({ceremonies: ceremonyList});
    renderPage();

    await screen.findByText('2024年（第96回）');
    const options = screen
      .getByLabelText('主催団体')
      .querySelectorAll('option');
    expect([...options].map(option => option.textContent)).toEqual([
      'すべて',
      'アカデミー賞',
      'ヴェネツィア国際映画祭',
    ]);
  });

  it('キーワード検索は団体名で絞り込む', async () => {
    respondWith({ceremonies: ceremonyList});
    renderPage();

    await screen.findByText('2024年（第96回）');
    fireEvent.change(screen.getByLabelText('キーワード検索'), {
      target: {value: 'ヴェネツィア'},
    });

    expect(screen.queryByText('2024年（第96回）')).not.toBeInTheDocument();
    expect(screen.getByText('2023年')).toBeInTheDocument();
  });

  it('キーワード検索は開催年でも絞り込む', async () => {
    respondWith({ceremonies: ceremonyList});
    renderPage();

    await screen.findByText('2024年（第96回）');
    fireEvent.change(screen.getByLabelText('キーワード検索'), {
      target: {value: '2022'},
    });

    expect(screen.getByText('2022年（第94回）')).toBeInTheDocument();
    expect(screen.queryByText('2024年（第96回）')).not.toBeInTheDocument();
  });

  it('主催団体フィルタで絞り込む', async () => {
    respondWith({ceremonies: ceremonyList});
    renderPage();

    await screen.findByText('2024年（第96回）');
    fireEvent.change(screen.getByLabelText('主催団体'), {
      target: {value: 'org-venice'},
    });

    expect(screen.getByText('2023年')).toBeInTheDocument();
    expect(screen.queryByText('2024年（第96回）')).not.toBeInTheDocument();
  });

  it('一致するセレモニーがなければその旨を表示する', async () => {
    respondWith({ceremonies: ceremonyList});
    renderPage();

    await screen.findByText('2024年（第96回）');
    fireEvent.change(screen.getByLabelText('キーワード検索'), {
      target: {value: '該当なし'},
    });

    expect(
      screen.getByText('条件に一致するセレモニーが見つかりませんでした。'),
    ).toBeInTheDocument();
  });

  it('取得に失敗したらエラーを表示する', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    respondWith({}, {ok: false, status: 500});
    renderPage();

    expect(
      await screen.findByText('セレモニー一覧の取得に失敗しました。'),
    ).toBeInTheDocument();
  });

  it('401のときはエラーを表示しない', async () => {
    respondWith({}, {ok: false, status: 401});
    renderPage();

    await waitFor(() => {
      expect(screen.queryByText('読み込み中です…')).not.toBeInTheDocument();
    });
    expect(
      screen.queryByText('セレモニー一覧の取得に失敗しました。'),
    ).not.toBeInTheDocument();
  });

  it('トークンがなければログインページへ遷移する', async () => {
    mockLocalStorage.getItem.mockReturnValue(null);
    renderPage();

    await waitFor(() => {
      expect(mockLocation.href).toBe('/admin/login');
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
