import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {YearEditor} from './year-editor';

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
  Object.defineProperty(globalThis, 'alert', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
});

const renderEditor = () => {
  const onMovieDataUpdate = vi.fn();
  render(
    <YearEditor
      apiUrl="http://localhost:8787"
      movieId="movie-1"
      year={2023}
      onMovieDataUpdate={onMovieDataUpdate}
    />,
  );
  return {onMovieDataUpdate};
};

describe('YearEditor', () => {
  it('現在の公開年を表示する', () => {
    renderEditor();

    expect(screen.getByText('2023')).toBeInTheDocument();
  });

  it('範囲外の年ではバリデーションエラーを表示する', async () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', {name: '編集'}));
    fireEvent.change(screen.getByPlaceholderText('2024'), {
      target: {value: '1800'},
    });
    fireEvent.click(screen.getByRole('button', {name: '保存'}));

    await waitFor(() => {
      expect(
        screen.getByText('年は1888から2100の間で入力してください'),
      ).toBeInTheDocument();
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('保存でPUT /admin/movies/:idに年を送信する', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    renderEditor();

    fireEvent.click(screen.getByRole('button', {name: '編集'}));
    fireEvent.change(screen.getByPlaceholderText('2024'), {
      target: {value: '2001'},
    });
    fireEvent.click(screen.getByRole('button', {name: '保存'}));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8787/admin/movies/movie-1',
        expect.objectContaining({method: 'PUT'}),
      );
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({year: 2001});

    await waitFor(() => {
      expect(globalThis.alert).toHaveBeenCalledWith('公開年を更新しました');
    });
  });
});
