import {act, renderHook} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {useAdminToken} from './use-admin-token';

describe('useAdminToken', () => {
  afterEach(() => {
    localStorage.removeItem('adminToken');
  });

  it('localStorage のトークンをマウント後に返す', () => {
    localStorage.setItem('adminToken', 'stored-token');

    const {result} = renderHook(() => useAdminToken());

    expect(result.current).toBe('stored-token');
  });

  it('トークンが無ければ undefined を返す', () => {
    const {result} = renderHook(() => useAdminToken());

    expect(result.current).toBeUndefined();
  });

  it('adminLogin イベントで新しいトークンを読み直す', () => {
    const {result} = renderHook(() => useAdminToken());

    act(() => {
      localStorage.setItem('adminToken', 'new-token');
      dispatchEvent(new Event('adminLogin'));
    });

    expect(result.current).toBe('new-token');
  });

  it('adminLogout イベントでトークンを消す', () => {
    localStorage.setItem('adminToken', 'stored-token');
    const {result} = renderHook(() => useAdminToken());

    act(() => {
      dispatchEvent(new Event('adminLogout'));
    });

    expect(result.current).toBeUndefined();
  });

  it('アンマウント後はイベントを受け取らない', () => {
    const {result, unmount} = renderHook(() => useAdminToken());
    unmount();

    act(() => {
      localStorage.setItem('adminToken', 'late-token');
      dispatchEvent(new Event('adminLogin'));
    });

    expect(result.current).toBeUndefined();
  });
});
