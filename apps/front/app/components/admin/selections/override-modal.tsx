import {useEffect, useState} from 'react';
import {MovieCard} from '@/components/molecules/movie-card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {adminFetch} from '@/lib/admin-fetch';
import {getPrimaryTitle} from './primary-title';
import {
  SELECTION_TYPE_LABELS,
  type SearchMovie,
  type SelectionData,
  type SelectionType,
} from './types';

type OverrideModalProperties = {
  apiUrl: string;
  locale: string;
  adminToken: string | undefined;
  type: SelectionType;
  onClose: () => void;
  onConfirm: (movie: {uid: string}) => void;
};

export function OverrideModal({
  apiUrl,
  locale,
  adminToken,
  type,
  onClose,
  onConfirm,
}: OverrideModalProperties) {
  const [activeTab, setActiveTab] = useState<'search' | 'random'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMovie[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [randomMovie, setRandomMovie] = useState<
    SelectionData['movie'] | undefined
  >();
  const [randomLoading, setRandomLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<
    SearchMovie | SelectionData['movie'] | undefined
  >();

  useEffect(() => {
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await adminFetch(
          `${apiUrl}/admin/movies?search=${encodeURIComponent(searchQuery)}&limit=20`,
        );

        if (response.ok) {
          const data = (await response.json()) as {movies: SearchMovie[]};
          setSearchResults(data.movies || []);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [searchQuery, apiUrl]);

  const generateRandomMovie = async () => {
    setRandomLoading(true);
    try {
      const response = await adminFetch(
        `${apiUrl}/admin/random-movie-preview`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({locale}),
        },
      );

      if (response.ok) {
        const data = (await response.json()) as SelectionData['movie'];
        setRandomMovie(data);
      }
    } catch (error) {
      console.error('Random movie error:', error);
    } finally {
      setRandomLoading(false);
    }
  };

  return (
    <div
      data-testid="override-modal"
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/50 px-4 py-6">
      <div className="mx-auto w-full max-w-4xl rounded-lg bg-white shadow-xl">
        <div className="border-b p-6">
          <h3 className="text-xl font-bold">映画選択をオーバーライド</h3>
          <p className="text-gray-600">{SELECTION_TYPE_LABELS[type]}の選択</p>
        </div>

        <div className="flex border-b">
          {(
            [
              {key: 'search', label: '映画を検索'},
              {key: 'random', label: 'ランダム選択'},
            ] as const
          ).map(tab => (
            <Button
              key={tab.key}
              data-testid={`${tab.key}-tab`}
              variant="ghost"
              className={`w-1/2 rounded-none border-b-2 text-sm font-medium ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </Button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'search' && (
            <div>
              <Input
                data-testid="movie-search-input"
                type="text"
                placeholder="映画タイトルを検索..."
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                className="mb-4"
              />
              {searchLoading && (
                <div className="text-center text-gray-600">検索中...</div>
              )}
              <div
                data-testid="search-results"
                className="max-h-96 space-y-2 overflow-y-auto">
                {searchResults.map(movie => (
                  <button
                    type="button"
                    key={movie.uid}
                    onClick={() => setSelectedMovie(movie)}
                    className={`w-full rounded-lg border p-4 text-left transition-colors ${
                      selectedMovie?.uid === movie.uid
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <h4 className="font-medium">{getPrimaryTitle(movie)}</h4>
                    <p className="text-sm text-gray-600">
                      {movie.year && `${movie.year}年`}
                      {movie.nominationCount > 0 &&
                        ` • ${movie.nominationCount}件のノミネート`}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'random' && (
            <div className="space-y-6 text-center">
              <Button
                onClick={generateRandomMovie}
                disabled={randomLoading}
                className="bg-green-600 text-white hover:bg-green-500 disabled:opacity-50">
                {randomLoading
                  ? 'ランダム映画を生成中...'
                  : 'ランダム映画を生成'}
              </Button>
              {randomMovie && (
                <div
                  data-testid="random-movie-result"
                  className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setSelectedMovie(randomMovie)}
                    className={`relative inline-flex rounded-xl transition-all duration-200 ${
                      selectedMovie?.uid === randomMovie.uid
                        ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white'
                        : 'hover:ring-2 hover:ring-blue-300 hover:ring-offset-2 hover:ring-offset-white'
                    }`}>
                    <MovieCard
                      movie={randomMovie}
                      locale={locale}
                      adminToken={adminToken}
                    />
                    {selectedMovie?.uid === randomMovie.uid && (
                      <span className="absolute top-3 right-3 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                        選択中
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t p-6">
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={() => {
              if (selectedMovie) {
                onConfirm(selectedMovie);
              }
            }}
            disabled={!selectedMovie}
            className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50">
            選択を確定
          </Button>
        </div>
      </div>
    </div>
  );
}
