import {useState, type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {adminFetch} from '@/lib/admin-fetch';
import {ensureToken} from './ensure-token';
import type {MovieSearchResult} from './types';

type MovieSearchPanelProperties = {
  apiUrl: string;
  selectedMovie: MovieSearchResult | undefined;
  onSelectMovie: (movie?: MovieSearchResult) => void;
};

export function MovieSearchPanel({
  apiUrl,
  selectedMovie,
  onSelectMovie,
}: MovieSearchPanelProperties) {
  const [movieSearchQuery, setMovieSearchQuery] = useState('');
  const [movieSearchResults, setMovieSearchResults] = useState<
    MovieSearchResult[]
  >([]);
  const [isSearchingMovies, setIsSearchingMovies] = useState(false);
  const [movieSearchError, setMovieSearchError] = useState<
    string | undefined
  >();

  const handleSearchMovies = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMovieSearchError(undefined);
    setMovieSearchResults([]);

    const trimmedQuery = movieSearchQuery.trim();
    if (trimmedQuery.length < 2) {
      setMovieSearchError('2文字以上のキーワードを入力してください。');
      return;
    }

    if (!ensureToken()) {
      return;
    }

    setIsSearchingMovies(true);

    try {
      const response = await adminFetch(
        `${apiUrl}/admin/movies?limit=10&search=${encodeURIComponent(trimmedQuery)}`,
      );

      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const data = (await response.json()) as {
        movies: Array<{
          uid: string;
          title: string;
          year: number | null;
          imdbUrl?: string | null;
        }>;
      };

      setMovieSearchResults(data.movies ?? []);
    } catch (error) {
      console.error('Movie search error:', error);
      setMovieSearchError('映画の検索に失敗しました。');
    } finally {
      setIsSearchingMovies(false);
    }
  };

  return (
    <>
      <form
        className="flex flex-col gap-3 md:flex-row md:items-end"
        onSubmit={handleSearchMovies}>
        <label className="flex flex-1 flex-col text-sm font-medium text-gray-700">
          キーワード検索
          <Input
            type="search"
            value={movieSearchQuery}
            onChange={event => setMovieSearchQuery(event.target.value)}
            placeholder="作品名など"
            className="mt-1"
          />
        </label>
        <Button
          type="submit"
          className="bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSearchingMovies}>
          {isSearchingMovies ? '検索中…' : '検索'}
        </Button>
      </form>

      {movieSearchError && (
        <div className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {movieSearchError}
        </div>
      )}

      {selectedMovie && (
        <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          選択中: {selectedMovie.title}
          {selectedMovie.year ? `（${selectedMovie.year}年）` : ''}
          <Button
            type="button"
            variant="link"
            size="sm"
            className="ml-2 text-blue-700 hover:text-blue-900"
            onClick={() => onSelectMovie()}>
            解除
          </Button>
        </div>
      )}

      {movieSearchResults.length > 0 && (
        <div className="rounded border border-gray-200">
          <ul className="divide-y divide-gray-200">
            {movieSearchResults.map(result => (
              <li
                key={result.uid}
                className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-gray-900">
                    {result.title}
                  </div>
                  <div className="text-xs text-gray-500">
                    UID: {result.uid}
                    {result.year ? ` / ${result.year}年` : ''}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-blue-600 text-blue-600 hover:bg-blue-50"
                  onClick={() => {
                    onSelectMovie(result);
                    setMovieSearchResults([]);
                  }}>
                  選択
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
