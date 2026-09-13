import '@testing-library/jest-dom';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ManualSelectionPanel} from './manual-selection-panel';

const apiUrl = 'http://localhost:8787';

const searchResponse = {
  ok: true,
  status: 200,
  json: async () => ({
    movies: [
      {
        uid: 'movie-1',
        year: 1954,
        translations: [
          {languageCode: 'ja', content: '七人の侍', isDefault: 0},
          {languageCode: 'en', content: 'Seven Samurai', isDefault: 1},
        ],
      },
    ],
  }),
};

const renderPanel = (
  overrides: Partial<Parameters<typeof ManualSelectionPanel>[0]> = {},
) =>
  render(
    <ManualSelectionPanel
      period="monthly"
      locale="ja"
      apiUrl={apiUrl}
      onClose={vi.fn()}
      onOverrideSuccess={vi.fn()}
      onOverrideLoadingChange={vi.fn()}
      isParentLoading={false}
      {...overrides}
    />,
  );

const searchFor = (query: string) => {
  fireEvent.change(screen.getByPlaceholderText('作品名や年で検索'), {
    target: {value: query},
  });
};

describe('ManualSelectionPanel', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('adminToken', 'test-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem('adminToken');
  });

  it('キーワードを入力すると /admin/movies を管理者トークン付きで検索する', async () => {
    fetchMock.mockResolvedValue(searchResponse);
    renderPanel();

    searchFor('侍');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${apiUrl}/admin/movies?search=${encodeURIComponent('侍')}&limit=20`,
        expect.objectContaining({headers: expect.any(Headers)}),
      );
    });
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('検索結果をロケールの題名と公開年で出す', async () => {
    fetchMock.mockResolvedValue(searchResponse);
    renderPanel();

    searchFor('侍');

    expect(await screen.findByText('七人の侍')).toBeInTheDocument();
    expect(screen.getByText('公開年: 1954')).toBeInTheDocument();
  });

  it('検索結果が空なら案内を出す', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({movies: []}),
    });
    renderPanel();

    searchFor('存在しない');

    expect(
      await screen.findByText('検索結果がありません。'),
    ).toBeInTheDocument();
  });

  it('検索に失敗したらエラーを出す', async () => {
    fetchMock.mockResolvedValue({ok: false, status: 500});
    renderPanel();

    searchFor('侍');

    expect(await screen.findByText('検索に失敗しました。')).toBeInTheDocument();
  });

  it('「この映画を設定」で /admin/override-selection に枠・日付・映画を POST する', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    vi.setSystemTime(new Date('2026-09-04T12:00:00Z'));
    try {
      fetchMock
        .mockResolvedValueOnce(searchResponse)
        .mockResolvedValueOnce({ok: true, status: 200, json: async () => ({})});
      const onOverrideSuccess = vi.fn();
      renderPanel({period: 'weekly', onOverrideSuccess});

      searchFor('侍');
      fireEvent.click(
        await screen.findByRole('button', {name: 'この映画を設定'}),
      );

      await waitFor(() => {
        expect(onOverrideSuccess).toHaveBeenCalledTimes(1);
      });
      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe(`${apiUrl}/admin/override-selection`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({
        type: 'weekly',
        date: '2026-09-04',
        movieId: 'movie-1',
      });
      expect(screen.getByText('選択を更新しました。')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('上書き中は親へローディングを通知し、終わったら戻す', async () => {
    fetchMock
      .mockResolvedValueOnce(searchResponse)
      .mockResolvedValueOnce({ok: true, status: 200, json: async () => ({})});
    const onOverrideLoadingChange = vi.fn();
    renderPanel({onOverrideLoadingChange});

    searchFor('侍');
    fireEvent.click(
      await screen.findByRole('button', {name: 'この映画を設定'}),
    );

    await waitFor(() => {
      expect(onOverrideLoadingChange).toHaveBeenLastCalledWith(false);
    });
    expect(onOverrideLoadingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('上書きに失敗したらエラーを出す', async () => {
    fetchMock.mockResolvedValueOnce(searchResponse).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({error: 'bad request'}),
    });
    renderPanel();

    searchFor('侍');
    fireEvent.click(
      await screen.findByRole('button', {name: 'この映画を設定'}),
    );

    expect(
      await screen.findByText('更新に失敗しました。もう一度お試しください。'),
    ).toBeInTheDocument();
  });

  it('親がローディング中は入力と設定ボタンを無効にする', async () => {
    fetchMock.mockResolvedValue(searchResponse);
    const {rerender} = renderPanel();

    searchFor('侍');
    await screen.findByRole('button', {name: 'この映画を設定'});

    rerender(
      <ManualSelectionPanel
        period="monthly"
        locale="ja"
        apiUrl={apiUrl}
        onClose={vi.fn()}
        onOverrideSuccess={vi.fn()}
        onOverrideLoadingChange={vi.fn()}
        isParentLoading
      />,
    );

    expect(screen.getByPlaceholderText('作品名や年で検索')).toBeDisabled();
    expect(screen.getByRole('button', {name: '処理中...'})).toBeDisabled();
  });

  it('閉じるボタンで onClose を呼ぶ', () => {
    const onClose = vi.fn();
    renderPanel({onClose});

    fireEvent.click(screen.getByRole('button', {name: '閉じる'}));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('英語ロケールでは英語の文言を出す', () => {
    renderPanel({locale: 'en'});

    expect(screen.getByText('Search and set a movie')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Search by title or year'),
    ).toBeInTheDocument();
  });
});
