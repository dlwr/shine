import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import '@testing-library/jest-dom';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import MovieInfoEditor from './movie-info-editor';

type MovieDetailsProps = Parameters<typeof MovieInfoEditor>[0]['movieData'];

const createMovieData = (
  overrides: Partial<MovieDetailsProps> = {},
): MovieDetailsProps => ({
  uid: 'movie-123',
  year: 2023,
  originalLanguage: 'ja',
  imdbId: undefined,
  tmdbId: undefined,
  translations: [
    {
      uid: 'translation-ja',
      languageCode: 'ja',
      content: 'テスト映画',
      isDefault: 1,
    },
    {
      uid: 'translation-en',
      languageCode: 'en',
      content: 'Test Movie',
      isDefault: 0,
    },
  ],
  nominations: [],
  posters: [],
  ...overrides,
});

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

describe('MovieInfoEditor 外部ID検索', () => {
  const apiUrl = 'http://localhost:8787';

  it('ID未設定の場合に外部ID検索パネルが自動で開き、初期値がセットされる', async () => {
    const movieData = createMovieData();

    render(
      <MovieInfoEditor
        movieData={movieData}
        apiUrl={apiUrl}
        movieId={movieData.uid}
        onMovieDataUpdate={vi.fn()}
      />,
    );

    const queryInput = await screen.findByLabelText('検索キーワード');
    expect(queryInput).toHaveValue('テスト映画');

    const languageSelect = screen.getByLabelText('検索言語');
    expect(languageSelect).toHaveValue('ja-JP');
  });

  it('検索実行後に候補を表示し、TMDb IDを設定できる', async () => {
    const movieData = createMovieData();
    const onMovieDataUpdate = vi.fn();

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    const searchResponse = {
      usedQuery: 'テスト映画',
      usedYear: 2023,
      results: [
        {
          tmdbId: 98765,
          imdbId: 'tt7654321',
          title: 'Test Movie Result',
          originalTitle: 'Original Title',
          releaseDate: '2023-02-01',
          overview: '概要テキスト',
          originalLanguage: 'ja',
          popularity: 1,
          voteAverage: 7.5,
          voteCount: 10,
          yearDifference: 0,
        },
      ],
    };

    const updatedMovie = createMovieData({
      tmdbId: 98765,
      imdbId: 'tt7654321',
    });

    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';

        if (url.includes('/external-id-search')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => searchResponse,
          });
        }

        if (url.endsWith('/tmdb-id') && method === 'PUT') {
          expect(init?.headers).toMatchObject({
            Authorization: 'Bearer admin-token',
            'Content-Type': 'application/json',
          });
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({success: true}),
          });
        }

        if (
          url.endsWith(`/admin/movies/${movieData.uid}`) &&
          method === 'GET'
        ) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => updatedMovie,
          });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({}),
        });
      },
    );

    render(
      <MovieInfoEditor
        movieData={movieData}
        apiUrl={apiUrl}
        movieId={movieData.uid}
        onMovieDataUpdate={onMovieDataUpdate}
      />,
    );

    const searchButton = await screen.findByRole('button', {name: '検索'});
    fireEvent.click(searchButton);

    await screen.findByText('Test Movie Result');

    const applyTmdbButton = screen.getByRole('button', {name: 'TMDb IDを設定'});
    fireEvent.click(applyTmdbButton);

    await waitFor(() => {
      expect(globalThis.alert).toHaveBeenCalledWith('TMDb IDを設定しました');
    });

    await waitFor(() => {
      expect(onMovieDataUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          tmdbId: 98765,
          imdbId: 'tt7654321',
        }),
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        `/admin/movies/${movieData.uid}/external-id-search`,
      ),
      expect.objectContaining({
        headers: {Authorization: 'Bearer admin-token'},
      }),
    );
  });
});
