import {useEffect, useState} from 'react';
import {Button} from '@/components/ui/button';
import {adminFetch} from '@/lib/admin-fetch';
import {
  getLocalizedMovieTitle,
  type PeriodType,
  type SearchMovie,
} from '@/lib/home';

export function ManualSelectionPanel({
  period,
  locale,
  apiUrl,
  onClose,
  onOverrideSuccess,
  onOverrideLoadingChange,
  isParentLoading,
}: {
  period: PeriodType;
  locale: string;
  apiUrl: string;
  onClose: () => void;
  onOverrideSuccess: () => Promise<void> | void;
  onOverrideLoadingChange: (isLoading: boolean) => void;
  isParentLoading: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchMovie[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearchLoading(false);
      return;
    }

    let isCancelled = false;
    setSearchLoading(true);
    setError(undefined);

    const timeoutId = setTimeout(async () => {
      try {
        const response = await adminFetch(
          `${apiUrl}/admin/movies?search=${encodeURIComponent(query)}&limit=20`,
        );

        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`);
        }

        const data = (await response.json()) as {movies: SearchMovie[]};

        if (!isCancelled) {
          setResults(data.movies ?? []);
        }
      } catch (error_) {
        if (isCancelled) {
          return;
        }

        console.error('Search error:', error_);
        setError(locale === 'ja' ? '検索に失敗しました。' : 'Search failed.');
        setResults([]);
      } finally {
        if (!isCancelled) {
          setSearchLoading(false);
        }
      }
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [query, apiUrl, locale]);

  const processingLabel = locale === 'ja' ? '処理中...' : 'Processing...';
  const searchPlaceholder =
    locale === 'ja' ? '作品名や年で検索' : 'Search by title or year';
  const hintText =
    locale === 'ja'
      ? 'キーワードを入力すると自動で検索します。'
      : 'Type a keyword and results will appear automatically.';
  const resultsEmptyText =
    locale === 'ja' ? '検索結果がありません。' : 'No movies found.';
  const closeLabel = locale === 'ja' ? '閉じる' : 'Close';
  const setMovieLabel = locale === 'ja' ? 'この映画を設定' : 'Set this movie';
  const searchLabel =
    locale === 'ja' ? '映画を検索して設定' : 'Search and set a movie';

  const isBusy = overrideLoading || isParentLoading;

  const handleOverride = async (movie: SearchMovie) => {
    if (isBusy) {
      return;
    }

    setOverrideLoading(true);
    onOverrideLoadingChange(true);
    setMessage(undefined);
    setError(undefined);

    try {
      const response = await adminFetch(`${apiUrl}/admin/override-selection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: period,
          date: new Date().toISOString().split('T', 1)[0],
          movieId: movie.uid,
        }),
      });

      if (!response.ok) {
        let serverMessage: string | undefined;
        try {
          const payload = (await response.json()) as {error?: string};
          serverMessage = payload.error;
        } catch (parseError) {
          console.debug('Failed to parse override error payload', parseError);
        }
        throw new Error(serverMessage ?? `Request failed: ${response.status}`);
      }

      await onOverrideSuccess();
      setMessage(
        locale === 'ja' ? '選択を更新しました。' : 'Selection updated.',
      );
      setQuery('');
      setResults([]);
    } catch (error_) {
      console.error('Override error:', error_);
      setError(
        locale === 'ja'
          ? '更新に失敗しました。もう一度お試しください。'
          : 'Failed to update selection. Please try again.',
      );
    } finally {
      setOverrideLoading(false);
      onOverrideLoadingChange(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-800">{searchLabel}</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-gray-500 hover:text-gray-700">
          {closeLabel}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
          disabled={isParentLoading}
        />
        <p className="text-xs text-gray-500">{hintText}</p>
      </div>

      {searchLoading && (
        <p className="text-sm text-gray-500">
          {locale === 'ja' ? '検索中...' : 'Searching...'}
        </p>
      )}

      {!searchLoading &&
        query.trim().length > 0 &&
        results.length === 0 &&
        !error && <p className="text-sm text-gray-500">{resultsEmptyText}</p>}

      <ul className="space-y-2">
        {results.map(movie => {
          const title = getLocalizedMovieTitle(movie, locale);
          return (
            <li
              key={movie.uid}
              className="flex flex-col gap-2 border-b border-gray-200 pb-3 last:border-0">
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">{title}</p>
                {movie.year !== undefined && (
                  <p className="text-xs text-gray-500">
                    {locale === 'ja'
                      ? `公開年: ${movie.year}`
                      : `Year: ${movie.year}`}
                  </p>
                )}
              </div>
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void handleOverride(movie);
                  }}
                  disabled={isBusy}>
                  {isBusy ? processingLabel : setMovieLabel}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {message && <p className="text-sm text-green-600">{message}</p>}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
