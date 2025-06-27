import type { Route } from "./+types/admin.movies";

interface AdminMovieData {
  movieUid: string;
  movie: {
    imdbId: string;
    tmdbId: number;
    year: number;
    duration: number;
    createdAt: string;
    updatedAt: string;
  };
  translations?: {
    languageCode: string;
    resourceType: string;
    content: string;
  }[];
  posterUrls?: {
    url: string;
    isPrimary: boolean;
  }[];
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function meta(): Route.MetaDescriptor[] {
  return [
    { title: "映画管理 | SHINE Admin" },
    { name: "description", content: "映画データベースの管理画面" }
  ];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  // 認証チェック（サーバーサイド用の疑似実装）
  let token: string | null = null;
  
  if (typeof window !== 'undefined') {
    token = localStorage.getItem('adminToken');
  }

  if (!token) {
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/admin/login' }
    });
  }

  try {
    const url = new URL(request.url);
    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '20';

    const apiUrl = context.cloudflare.env.PUBLIC_API_URL || 'http://localhost:8787';
    const response = await fetch(`${apiUrl}/admin/movies?page=${page}&limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 401) {
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/admin/login' }
      });
    }

    if (!response.ok) {
      throw new Error('Failed to fetch movies');
    }

    const data = await response.json();
    return data;
  } catch {
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/admin/login' }
    });
  }
}

export default function AdminMovies({ loaderData }: Route.ComponentProps) {
  const { movies, pagination } = loaderData as { movies: AdminMovieData[]; pagination: PaginationData };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('adminToken');
      window.location.href = '/admin/login';
    }
  };

  const handleDelete = (movieUid: string) => {
    if (confirm('この映画を削除しますか？')) {
      // 削除処理（実装省略）
      console.log('Delete movie:', movieUid);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">映画管理</h1>
            <nav className="flex space-x-4">
              <a 
                href="/" 
                className="text-blue-600 hover:text-blue-800 transition-colors"
              >
                ホーム
              </a>
              <button
                onClick={handleLogout}
                className="text-red-600 hover:text-red-800 transition-colors"
              >
                ログアウト
              </button>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* ページネーション情報 */}
        <div className="mb-6 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            合計: {pagination.total}件
          </div>
          <div className="text-sm text-gray-600">
            {pagination.page} / {pagination.totalPages} ページ
          </div>
        </div>

        {/* 映画リスト */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {movies.map((movie) => {
              const title = movie.translations?.find((t) => t.languageCode === 'ja')?.content || 'タイトル不明';
              const posterUrl = movie.posterUrls?.find((p) => p.isPrimary)?.url || movie.posterUrls?.[0]?.url;

              return (
                <li key={movie.movieUid} className="px-6 py-4">
                  <div className="flex items-center space-x-4">
                    {/* ポスター */}
                    <div className="flex-shrink-0 w-16 h-24">
                      {posterUrl ? (
                        <img 
                          src={posterUrl} 
                          alt={title}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-200 rounded flex items-center justify-center">
                          <span className="text-xs text-gray-500">No Image</span>
                        </div>
                      )}
                    </div>

                    {/* 映画情報 */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {title}
                      </h3>
                      <div className="mt-1 flex flex-wrap gap-2 text-sm text-gray-600">
                        <span>{movie.movie.year}年</span>
                        <span>{movie.movie.duration}分</span>
                        <span>{movie.movie.imdbId}</span>
                      </div>
                    </div>

                    {/* アクション */}
                    <div className="flex space-x-2">
                      <a
                        href={`/admin/movies/${movie.movieUid}`}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        編集
                      </a>
                      <button
                        onClick={() => handleDelete(movie.movieUid)}
                        className="inline-flex items-center px-3 py-1 border border-red-300 rounded-md text-sm bg-white text-red-700 hover:bg-red-50 transition-colors"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ページネーション */}
        {pagination.totalPages > 1 && (
          <div className="mt-6 flex justify-center space-x-2">
            {pagination.page > 1 && (
              <a
                href={`/admin/movies?page=${pagination.page - 1}`}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              >
                前のページ
              </a>
            )}
            {pagination.page < pagination.totalPages && (
              <a
                href={`/admin/movies?page=${pagination.page + 1}`}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              >
                次のページ
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}