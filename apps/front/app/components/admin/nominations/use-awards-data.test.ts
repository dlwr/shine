import {renderHook, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {useAwardsData} from './use-awards-data';

const awardsResponse = {
  organizations: [
    {
      uid: 'org-1',
      name: '日本アカデミー賞',
      country: 'Japan',
      shortName: 'JAA',
    },
  ],
  ceremonies: [
    {
      uid: 'ceremony-1',
      organizationUid: 'org-1',
      year: 2024,
      ceremonyNumber: 47,
      organizationName: '日本アカデミー賞',
    },
  ],
  categories: [
    {
      uid: 'category-1',
      organizationUid: 'org-1',
      name: '最優秀作品賞',
      organizationName: '日本アカデミー賞',
    },
  ],
};

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

vi.stubGlobal('localStorage', mockLocalStorage);

describe('useAwardsData', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLocalStorage.getItem.mockReturnValue('admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('管理者トークン付きで /admin/awards を取得する', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(awardsResponse),
    } as Response);

    const {result} = renderHook(() => useAwardsData('http://localhost:8787'));

    expect(result.current.loadingAwards).toBe(true);

    await waitFor(() => expect(result.current.loadingAwards).toBe(false));

    const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(input).toBe('http://localhost:8787/admin/awards');
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer admin-token',
    );
    expect(result.current.awardsData).toEqual(awardsResponse);
    expect(result.current.awardsError).toBeUndefined();
  });

  it('取得に失敗したらエラーメッセージを持つ', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response);

    const {result} = renderHook(() => useAwardsData('http://localhost:8787'));

    await waitFor(() => expect(result.current.loadingAwards).toBe(false));

    expect(result.current.awardsData).toBeUndefined();
    expect(result.current.awardsError).toBe('授賞データの取得に失敗しました');
  });

  it('401 のときはエラーにしない', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    } as Response);

    const {result} = renderHook(() => useAwardsData('http://localhost:8787'));

    await waitFor(() => expect(result.current.loadingAwards).toBe(false));

    expect(result.current.awardsData).toBeUndefined();
    expect(result.current.awardsError).toBeUndefined();
  });
});
