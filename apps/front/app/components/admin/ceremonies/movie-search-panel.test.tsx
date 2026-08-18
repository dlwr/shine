import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MovieSearchPanel} from './movie-search-panel';

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

beforeEach(() => {
  vi.resetAllMocks();
  mockLocalStorage.getItem.mockReturnValue('admin-token');
  Object.defineProperty(globalThis, 'fetch', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
});

describe('MovieSearchPanel', () => {
  const apiUrl = 'http://localhost:8787';

  it('2文字未満のキーワードではエラーメッセージを表示する', async () => {
    render(
      <MovieSearchPanel
        apiUrl={apiUrl}
        selectedMovie={undefined}
        onSelectMovie={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('キーワード検索'), {
      target: {value: 'あ'},
    });
    fireEvent.click(screen.getByRole('button', {name: '検索'}));

    await waitFor(() => {
      expect(
        screen.getByText('2文字以上のキーワードを入力してください。'),
      ).toBeInTheDocument();
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('検索で/admin/moviesにリクエストし結果を表示する', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        movies: [{uid: 'movie-1', title: '七人の侍', year: 1954}],
      }),
    });

    render(
      <MovieSearchPanel
        apiUrl={apiUrl}
        selectedMovie={undefined}
        onSelectMovie={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('キーワード検索'), {
      target: {value: '七人の侍'},
    });
    fireEvent.click(screen.getByRole('button', {name: '検索'}));

    await screen.findByText('七人の侍');
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/admin/movies?limit=10&search=${encodeURIComponent('七人の侍')}`,
      expect.anything(),
    );
  });

  it('検索結果の選択でonSelectMovieが呼ばれる', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const movie = {uid: 'movie-1', title: '七人の侍', year: 1954};
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({movies: [movie]}),
    });
    const onSelectMovie = vi.fn();

    render(
      <MovieSearchPanel
        apiUrl={apiUrl}
        selectedMovie={undefined}
        onSelectMovie={onSelectMovie}
      />,
    );

    fireEvent.change(screen.getByLabelText('キーワード検索'), {
      target: {value: '七人の侍'},
    });
    fireEvent.click(screen.getByRole('button', {name: '検索'}));

    await screen.findByText('七人の侍');
    fireEvent.click(screen.getByRole('button', {name: '選択'}));

    expect(onSelectMovie).toHaveBeenCalledWith(movie);
  });

  it('選択中の映画の解除ボタンでonSelectMovieが引数なしで呼ばれる', () => {
    const onSelectMovie = vi.fn();

    render(
      <MovieSearchPanel
        apiUrl={apiUrl}
        selectedMovie={{uid: 'movie-1', title: '七人の侍', year: 1954}}
        onSelectMovie={onSelectMovie}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: '解除'}));

    expect(onSelectMovie).toHaveBeenCalledWith();
  });
});
