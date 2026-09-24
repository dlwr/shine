import {beforeEach, describe, expect, it, vi, type Mock} from 'vitest';
import {
  adminFetch,
  adminJson,
  clearAdminToken,
  fetchAdminMovie,
  getAdminToken,
  setAdminToken,
} from './admin-fetch';

const fetchMock = fetch as Mock;

const lastFetchHeaders = () => {
  const [, init] = fetchMock.mock.calls.at(-1) as [unknown, RequestInit];
  return new Headers(init.headers);
};

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  location.assign('http://localhost:3000/');
});

describe('getAdminToken', () => {
  it('localStorageのadminTokenを返す', () => {
    localStorage.setItem('adminToken', 'token-123');

    expect(getAdminToken()).toBe('token-123');
  });

  it('トークンが無ければundefinedを返す', () => {
    expect(getAdminToken()).toBeUndefined();
  });
});

describe('setAdminToken', () => {
  it('localStorageにトークンを保存する', () => {
    setAdminToken('token-abc');

    expect(localStorage.getItem('adminToken')).toBe('token-abc');
  });

  it('adminLoginイベントをdispatchする', () => {
    const listener = vi.fn();
    addEventListener('adminLogin', listener);

    setAdminToken('token-abc');

    expect(listener).toHaveBeenCalledTimes(1);
    removeEventListener('adminLogin', listener);
  });
});

describe('clearAdminToken', () => {
  it('localStorageからトークンを削除する', () => {
    localStorage.setItem('adminToken', 'token-abc');

    clearAdminToken();

    expect(localStorage.getItem('adminToken')).toBeNull();
  });

  it('adminLogoutイベントをdispatchする', () => {
    const listener = vi.fn();
    addEventListener('adminLogout', listener);

    clearAdminToken();

    expect(listener).toHaveBeenCalledTimes(1);
    removeEventListener('adminLogout', listener);
  });
});

describe('adminFetch', () => {
  it('Authorizationヘッダを自動付与する', async () => {
    localStorage.setItem('adminToken', 'token-xyz');
    fetchMock.mockResolvedValue(new Response('{}', {status: 200}));

    await adminFetch('https://api.example.com/admin/movies');

    expect(lastFetchHeaders().get('authorization')).toBe('Bearer token-xyz');
  });

  it('トークンが無ければAuthorizationヘッダを付与しない', async () => {
    fetchMock.mockResolvedValue(new Response('{}', {status: 200}));

    await adminFetch('https://api.example.com/admin/movies');

    expect(lastFetchHeaders().get('authorization')).toBeNull();
  });

  it('initのmethodや既存ヘッダを引き継ぐ', async () => {
    localStorage.setItem('adminToken', 'token-xyz');
    fetchMock.mockResolvedValue(new Response('{}', {status: 200}));

    await adminFetch('https://api.example.com/admin/movies', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: '{}',
    });

    const [, init] = fetchMock.mock.calls.at(-1) as [unknown, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
    expect(lastFetchHeaders().get('content-type')).toBe('application/json');
    expect(lastFetchHeaders().get('authorization')).toBe('Bearer token-xyz');
  });

  it('成功レスポンスをそのまま返す', async () => {
    localStorage.setItem('adminToken', 'token-xyz');
    fetchMock.mockResolvedValue(new Response('{"ok":true}', {status: 200}));

    const response = await adminFetch('https://api.example.com/admin/movies');

    expect(response.status).toBe(200);
    expect(localStorage.getItem('adminToken')).toBe('token-xyz');
    expect(location.href).toBe('http://localhost:3000/');
  });

  it('401ならトークンを削除して/admin/loginへリダイレクトする', async () => {
    localStorage.setItem('adminToken', 'token-xyz');
    fetchMock.mockResolvedValue(new Response('Unauthorized', {status: 401}));

    await adminFetch('https://api.example.com/admin/movies');

    expect(localStorage.getItem('adminToken')).toBeNull();
    expect(location.href).toBe('/admin/login');
  });

  it('401時にadminLogoutイベントをdispatchする', async () => {
    localStorage.setItem('adminToken', 'token-xyz');
    fetchMock.mockResolvedValue(new Response('Unauthorized', {status: 401}));
    const listener = vi.fn();
    addEventListener('adminLogout', listener);

    await adminFetch('https://api.example.com/admin/movies');

    expect(listener).toHaveBeenCalledTimes(1);
    removeEventListener('adminLogout', listener);
  });

  it('401でもそのResponseを返す', async () => {
    fetchMock.mockResolvedValue(new Response('Unauthorized', {status: 401}));

    const response = await adminFetch('https://api.example.com/admin/movies');

    expect(response.status).toBe(401);
  });

  it('401以外のエラーではリダイレクトしない', async () => {
    localStorage.setItem('adminToken', 'token-xyz');
    fetchMock.mockResolvedValue(new Response('Server Error', {status: 500}));

    const response = await adminFetch('https://api.example.com/admin/movies');

    expect(response.status).toBe(500);
    expect(localStorage.getItem('adminToken')).toBe('token-xyz');
    expect(location.href).toBe('http://localhost:3000/');
  });
});

describe('adminJson', () => {
  it('成功したら応答の JSON を返す', async () => {
    fetchMock.mockResolvedValue(new Response('{"movies":[]}', {status: 200}));

    const data = await adminJson<{movies: unknown[]}>(
      'https://api.example.com/admin/movies',
      '取得に失敗しました',
    );

    expect(data).toEqual({movies: []});
  });

  it('トークンを付けて送る', async () => {
    localStorage.setItem('adminToken', 'token-xyz');
    fetchMock.mockResolvedValue(new Response('{}', {status: 200}));

    await adminJson('https://api.example.com/admin/movies', '失敗');

    expect(lastFetchHeaders().get('authorization')).toBe('Bearer token-xyz');
  });

  it('失敗したら API のエラー文言で投げる', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"error":"Movie not found"}', {status: 404}),
    );

    await expect(
      adminJson('https://api.example.com/admin/movies/x', '取得に失敗しました'),
    ).rejects.toThrow('Movie not found');
  });

  it('失敗した応答にエラー文言が無ければ既定の文言で投げる', async () => {
    fetchMock.mockResolvedValue(new Response('Server Error', {status: 500}));

    await expect(
      adminJson('https://api.example.com/admin/movies', '取得に失敗しました'),
    ).rejects.toThrow('取得に失敗しました');
  });
});

describe('fetchAdminMovie', () => {
  it('管理用の映画詳細を取得する', async () => {
    fetchMock.mockResolvedValue(new Response('{"uid":"m1"}', {status: 200}));

    const movie = await fetchAdminMovie('https://api.example.com', 'm1');

    expect(movie).toEqual({uid: 'm1'});
  });

  it('管理用の映画詳細の URL を叩く', async () => {
    fetchMock.mockResolvedValue(new Response('{}', {status: 200}));

    await fetchAdminMovie('https://api.example.com', 'm1');

    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      'https://api.example.com/admin/movies/m1',
    );
  });

  it('取得に失敗したら undefined を返す', async () => {
    fetchMock.mockResolvedValue(new Response('Server Error', {status: 500}));

    const movie = await fetchAdminMovie('https://api.example.com', 'm1');

    expect(movie).toBeUndefined();
  });
});
