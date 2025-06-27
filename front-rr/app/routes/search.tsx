import type { Route } from './+types/search';

interface SearchMovieData {
  movieUid: string;
  movie: {
    imdbId: string;
    year: number;
    duration: number;
  };
  translations?: {
    languageCode: string;
    content: string;
  }[];
  posterUrls?: {
    url: string;
    isPrimary: boolean;
  }[];
}

interface SearchPaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function meta({ data }: Route.MetaArgs): Route.MetaDescriptor[] {
  const { searchQuery } = data as { searchQuery: string };

  if (searchQuery) {
    return [
      { title: `「${searchQuery}」の検索結果 | SHINE` },
      {
        name: 'description',
        content: `「${searchQuery}」の検索結果 - SHINE映画データベース`
      }
    ];
  }

  return [
    { title: '映画検索 | SHINE' },
    { name: 'description', content: 'SHINE映画データベースで映画を検索' }
  ];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get('q') || '';
  const page = url.searchParams.get('page') || '1';
  const limit = url.searchParams.get('limit') || '20';

  if (!searchQuery) {
    return {
      searchQuery: '',
      searchResults: undefined
    };
  }

  try {
    const apiUrl =
      context.cloudflare.env.PUBLIC_API_URL || 'http://localhost:8787';
    const response = await fetch(
      `${apiUrl}/movies/search?q=${encodeURIComponent(searchQuery)}&page=${page}&limit=${limit}`
    );

    if (!response.ok) {
      throw new Error('Search failed');
    }

    const searchResults = await response.json();
    return {
      searchQuery,
      searchResults
    };
  } catch {
    return {
      searchQuery,
      error: '検索に失敗しました'
    };
  }
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const { searchQuery, searchResults, error } = loaderData as {
    searchQuery: string;
    searchResults?: {
      movies: SearchMovieData[];
      pagination: SearchPaginationData;
    };
    error?: string;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">映画検索</h1>
          <a
            href="/"
            className="text-blue-600 hover:text-blue-800 transition-colors"
          >
            ← ホームに戻る
          </a>
        </header>

        {/* 検索フォーム */}
        <form method="get" className="mb-8">
          <div className="flex gap-2">
            <input
              type="text"
              name="q"
              defaultValue={searchQuery}
              placeholder="映画タイトルを入力..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              検索
            </button>
          </div>
        </form>

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* 検索結果 */}
        {searchResults && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                「{searchQuery}」の検索結果
              </h2>
              <p className="text-gray-600">
                {searchResults.pagination.total}件見つかりました
              </p>
            </div>

            {searchResults.movies.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600 text-lg">
                  検索結果が見つかりませんでした
                </p>
                <p className="text-gray-500 mt-2">
                  別のキーワードで検索してみてください
                </p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {searchResults.movies.map((movie) => {
                  const title =
                    movie.translations?.find((t) => t.languageCode === 'ja')
                      ?.content || 'タイトル不明';
                  const posterUrl =
                    movie.posterUrls?.find((p) => p.isPrimary)?.url ||
                    movie.posterUrls?.[0]?.url;

                  return (
                    <div
                      key={movie.movieUid}
                      className="bg-white rounded-lg shadow-md p-6"
                    >
                      <div className="flex space-x-4">
                        {/* ポスター */}
                        <div className="flex-shrink-0 w-20 h-30">
                          {posterUrl ? (
                            <img
                              src={posterUrl}
                              alt={title}
                              className="w-full h-full object-cover rounded"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-200 rounded flex items-center justify-center">
                              <span className="text-xs text-gray-500">
                                No Image
                              </span>
                            </div>
                          )}
                        </div>

                        {/* 映画情報 */}
                        <div className="flex-1 min-w-0">
                          <a
                            href={`/movies/${movie.movieUid}`}
                            className="block hover:text-blue-600 transition-colors"
                          >
                            <h3 className="text-lg font-medium text-gray-900 mb-2">
                              {title}
                            </h3>
                          </a>
                          <div className="space-y-1 text-sm text-gray-600">
                            <p>
                              {movie.movie.year}年 • {movie.movie.duration}分
                            </p>
                            <p>IMDb: {movie.movie.imdbId}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ページネーション */}
            {searchResults.pagination.totalPages > 1 && (
              <div className="mt-8 flex justify-center space-x-2">
                {searchResults.pagination.page > 1 && (
                  <a
                    href={`/search?q=${encodeURIComponent(searchQuery)}&page=${searchResults.pagination.page - 1}`}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                  >
                    前のページ
                  </a>
                )}

                <span className="px-4 py-2 text-gray-600">
                  {searchResults.pagination.page} /{' '}
                  {searchResults.pagination.totalPages}
                </span>

                {searchResults.pagination.page <
                  searchResults.pagination.totalPages && (
                  <a
                    href={`/search?q=${encodeURIComponent(searchQuery)}&page=${searchResults.pagination.page + 1}`}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                  >
                    次のページ
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
