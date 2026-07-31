import {beforeEach, describe, expect, it, vi, type Mock} from 'vitest';
import {
  adminFetch,
  clearAdminToken,
  getAdminToken,
  setAdminToken,
} from './admin-fetch';

const fetchMock = globalThis.fetch as Mock;

const lastFetchHeaders = () => {
  const [, init] = fetchMock.mock.calls.at(-1) as [unknown, RequestInit];
  return new Headers(init.headers);
};

beforeEach(() => {
  globalThis.localStorage.clear();
  fetchMock.mockReset();
  globalThis.location.href = 'http://localhost:3000/';
});

describe('getAdminToken', () => {
  it('localStorageのadminTokenを返す', () => {
    globalThis.localStorage.setItem('adminToken', 'token-123');

    expect(getAdminToken()).toBe('token-123');
  });

  it('トークンが無ければundefinedを返す', () => {
    expect(getAdminToken()).toBeUndefined();
  });
});

describe('setAdminToken', () => {
  it('localStorageにトークンを保存する', () => {
    setAdminToken('token-abc');

    expect(globalThis.localStorage.getItem('adminToken')).toBe('token-abc');
  });

  it('adminLoginイベントをdispatchする', () => {
    const listener = vi.fn();
    globalThis.addEventListener('adminLogin', listener);

    setAdminToken('token-abc');

    expect(listener).toHaveBeenCalledTimes(1);
    globalThis.removeEventListener('adminLogin', listener);
  });
});

describe('clearAdminToken', () => {
  it('localStorageからトークンを削除する', () => {
    globalThis.localStorage.setItem('adminToken', 'token-abc');

    clearAdminToken();

    expect(globalThis.localStorage.getItem('adminToken')).toBeNull();
  });

  it('adminLogoutイベントをdispatchする', () => {
    const listener = vi.fn();
    globalThis.addEventListener('adminLogout', listener);

    clearAdminToken();

    expect(listener).toHaveBeenCalledTimes(1);
    globalThis.removeEventListener('adminLogout', listener);
  });
});

describe('adminFetch', () => {
  it('Authorizationヘッダを自動付与する', async () => {
    globalThis.localStorage.setItem('adminToken', 'token-xyz');
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
    globalThis.localStorage.setItem('adminToken', 'token-xyz');
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
    globalThis.localStorage.setItem('adminToken', 'token-xyz');
    fetchMock.mockResolvedValue(new Response('{"ok":true}', {status: 200}));

    const response = await adminFetch('https://api.example.com/admin/movies');

    expect(response.status).toBe(200);
    expect(globalThis.localStorage.getItem('adminToken')).toBe('token-xyz');
    expect(globalThis.location.href).toBe('http://localhost:3000/');
  });

  it('401ならトークンを削除して/admin/loginへリダイレクトする', async () => {
    globalThis.localStorage.setItem('adminToken', 'token-xyz');
    fetchMock.mockResolvedValue(new Response('Unauthorized', {status: 401}));

    await adminFetch('https://api.example.com/admin/movies');

    expect(globalThis.localStorage.getItem('adminToken')).toBeNull();
    expect(globalThis.location.href).toBe('/admin/login');
  });

  it('401時にadminLogoutイベントをdispatchする', async () => {
    globalThis.localStorage.setItem('adminToken', 'token-xyz');
    fetchMock.mockResolvedValue(new Response('Unauthorized', {status: 401}));
    const listener = vi.fn();
    globalThis.addEventListener('adminLogout', listener);

    await adminFetch('https://api.example.com/admin/movies');

    expect(listener).toHaveBeenCalledTimes(1);
    globalThis.removeEventListener('adminLogout', listener);
  });

  it('401でもそのResponseを返す', async () => {
    fetchMock.mockResolvedValue(new Response('Unauthorized', {status: 401}));

    const response = await adminFetch('https://api.example.com/admin/movies');

    expect(response.status).toBe(401);
  });

  it('401以外のエラーではリダイレクトしない', async () => {
    globalThis.localStorage.setItem('adminToken', 'token-xyz');
    fetchMock.mockResolvedValue(new Response('Server Error', {status: 500}));

    const response = await adminFetch('https://api.example.com/admin/movies');

    expect(response.status).toBe(500);
    expect(globalThis.localStorage.getItem('adminToken')).toBe('token-xyz');
    expect(globalThis.location.href).toBe('http://localhost:3000/');
  });
});
