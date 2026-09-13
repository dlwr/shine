import '@testing-library/jest-dom';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SelectionAdminControls} from './selection-admin-controls';

const apiUrl = 'http://localhost:8787';

const refreshedMovies = {
  monthly: {uid: 'movie-9', title: '新しい月間映画', year: 2020},
};

const renderControls = (
  overrides: Partial<Parameters<typeof SelectionAdminControls>[0]> = {},
) =>
  render(
    <SelectionAdminControls
      period="monthly"
      movieUid="movie-3"
      locale="ja"
      apiUrl={apiUrl}
      adminToken="test-token"
      onMoviesChange={vi.fn()}
      onError={vi.fn()}
      {...overrides}
    />,
  );

describe('SelectionAdminControls', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('alert', vi.fn());
    localStorage.setItem('adminToken', 'test-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem('adminToken');
  });

  it('映画があれば編集ページへのリンクを出す', () => {
    renderControls();

    expect(screen.getByRole('link', {name: '編集'})).toHaveAttribute(
      'href',
      '/admin/movies/movie-3',
    );
  });

  it('映画が無ければ編集リンクを出さない', () => {
    renderControls({movieUid: undefined});

    expect(screen.queryByRole('link', {name: '編集'})).not.toBeInTheDocument();
  });

  it('再抽選で /reselect に枠とロケールを POST し、選出を取り直す', async () => {
    fetchMock
      .mockResolvedValueOnce({ok: true, status: 200})
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => refreshedMovies,
      });
    const onMoviesChange = vi.fn();
    const onError = vi.fn();
    renderControls({period: 'weekly', locale: 'en', onMoviesChange, onError});

    fireEvent.click(screen.getByRole('button', {name: 'Re-select'}));

    await waitFor(() => {
      expect(onMoviesChange).toHaveBeenCalledWith(refreshedMovies);
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${apiUrl}/reselect`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      type: 'weekly',
      locale: 'en',
    });
    expect(fetchMock.mock.calls[1][0]).toMatch(
      /^http:\/\/localhost:8787\/\?cache=.*&locale=en$/,
    );
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('再抽選中はボタンを無効にして処理中と出す', async () => {
    const reselect = Promise.withResolvers<{ok: boolean; status: number}>();
    fetchMock.mockReturnValueOnce(reselect.promise);
    renderControls();

    fireEvent.click(screen.getByRole('button', {name: '再抽選'}));

    expect(await screen.findByText('処理中...')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: '検索して設定'})).toBeDisabled();

    reselect.resolve({ok: false, status: 500});
    await waitFor(() => {
      expect(screen.getByRole('button', {name: '再抽選'})).toBeEnabled();
    });
  });

  it('再抽選に失敗したら alert とエラーを出す', async () => {
    fetchMock.mockResolvedValueOnce({ok: false, status: 500});
    const onError = vi.fn();
    renderControls({onError});

    fireEvent.click(screen.getByRole('button', {name: '再抽選'}));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        '最新の映画情報を取得できませんでした。',
      );
    });
    expect(alert).toHaveBeenCalledWith(
      'エラーが発生しました。再度お試しください。',
    );
  });

  it('トークンが無ければ再抽選せずログインを促す', () => {
    renderControls({adminToken: undefined});

    fireEvent.click(screen.getByRole('button', {name: '再抽選'}));

    expect(alert).toHaveBeenCalledWith('管理者としてログインしてください');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('「検索して設定」で手動選出パネルを開閉する', () => {
    renderControls();

    fireEvent.click(screen.getByRole('button', {name: '検索して設定'}));
    expect(screen.getByText('映画を検索して設定')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: '検索を閉じる'}));
    expect(screen.queryByText('映画を検索して設定')).not.toBeInTheDocument();
  });

  it('パネルの閉じるボタンでも閉じる', () => {
    renderControls();

    fireEvent.click(screen.getByRole('button', {name: '検索して設定'}));
    fireEvent.click(screen.getByRole('button', {name: '閉じる'}));

    expect(screen.queryByText('映画を検索して設定')).not.toBeInTheDocument();
  });
});
