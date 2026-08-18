import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TmdbIdEditor} from './tmdb-id-editor';

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
  Object.defineProperties(globalThis, {
  	fetch: {
	    value: vi.fn(),
	    writable: true,
	    configurable: true,
	  },
  	alert: {
	    value: vi.fn(),
	    writable: true,
	    configurable: true,
	  },
  });
});

const renderEditor = (
  overrides: Partial<Parameters<typeof TmdbIdEditor>[0]> = {},
) => {
  const properties: Parameters<typeof TmdbIdEditor>[0] = {
    apiUrl: 'http://localhost:8787',
    movieId: 'movie-1',
    tmdbId: undefined,
    tmdbError: undefined,
    onTmdbErrorChange: vi.fn(),
    onRefreshErrorChange: vi.fn(),
    performTmdbUpdate: vi.fn(),
    onMovieDataUpdate: vi.fn(),
    ...overrides,
  };

  render(<TmdbIdEditor {...properties} />);
  return properties;
};

describe('TmdbIdEditor', () => {
  it('保存でperformTmdbUpdateに数値のIDを渡す', async () => {
    const performTmdbUpdate = vi.fn().mockResolvedValue(true);
    renderEditor({performTmdbUpdate});

    fireEvent.click(screen.getByRole('button', {name: '編集'}));
    fireEvent.change(screen.getByPlaceholderText('12345'), {
      target: {value: '98765'},
    });
    fireEvent.click(screen.getByRole('button', {name: '保存'}));

    await waitFor(() => {
      expect(performTmdbUpdate).toHaveBeenCalledWith(98_765);
    });
    await waitFor(() => {
      expect(globalThis.alert).toHaveBeenCalledWith('TMDb IDを更新しました');
    });
  });

  it('不正な値ではonTmdbErrorChangeにバリデーションエラーを渡す', async () => {
    const onTmdbErrorChange = vi.fn();
    const performTmdbUpdate = vi.fn();
    renderEditor({onTmdbErrorChange, performTmdbUpdate});

    fireEvent.click(screen.getByRole('button', {name: '編集'}));
    fireEvent.change(screen.getByPlaceholderText('12345'), {
      target: {value: '-5'},
    });
    fireEvent.click(screen.getByRole('button', {name: '保存'}));

    await waitFor(() => {
      expect(onTmdbErrorChange).toHaveBeenCalledWith(
        'TMDb IDは正の整数である必要があります',
      );
    });
    expect(performTmdbUpdate).not.toHaveBeenCalled();
  });

  it('TMDb情報更新でPOST /admin/movies/:id/refresh-tmdbを呼ぶ', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    renderEditor({tmdbId: 98_765});

    fireEvent.click(screen.getByRole('button', {name: 'TMDb情報更新'}));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8787/admin/movies/movie-1/refresh-tmdb',
        expect.objectContaining({method: 'POST'}),
      );
    });
    await waitFor(() => {
      expect(globalThis.alert).toHaveBeenCalledWith('TMDb情報を更新しました');
    });
  });
});
