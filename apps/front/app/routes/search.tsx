import type {Route} from './+types/search';
import {Masthead} from '@/components/editorial/masthead';
import {SearchRow} from '@/components/editorial/search-row';
import {selectBestPoster} from '@/lib/poster';
import type {PosterInfo} from '@/lib/poster';

type SearchMovieData = {
  movieUid: string;
  movie: {
    imdbId: string;
    year: number;
    duration: number;
  };
  translations?: Array<{
    languageCode: string;
    content: string;
  }>;
  posterUrls?: PosterInfo[];
};

type SearchPaginationData = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function meta({data}: Route.MetaArgs): Route.MetaDescriptors {
  const {searchQuery} = data as {searchQuery: string};

  if (searchQuery) {
    return [
      {title: `「${searchQuery}」の検索結果 | SHINE`},
      {
        name: 'description',
        content: `「${searchQuery}」の検索結果 - SHINE映画データベース`,
      },
    ];
  }

  return [
    {title: '映画検索 | SHINE'},
    {name: 'description', content: 'SHINE映画データベースで映画を検索'},
  ];
}

export async function loader({context, request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get('q') || '';
  const page = url.searchParams.get('page') || '1';
  const limit = url.searchParams.get('limit') || '20';

  if (!searchQuery) {
    return {
      searchQuery: '',
      searchResults: undefined,
    };
  }

  try {
    const apiUrl =
      (context.cloudflare as {env: {PUBLIC_API_URL?: string}}).env
        .PUBLIC_API_URL || 'http://localhost:8787';
    const response = await fetch(
      `${apiUrl}/movies/search?q=${encodeURIComponent(searchQuery)}&page=${page}&limit=${limit}`,
      {
        signal: request.signal,
      },
    );

    if (!response.ok) {
      throw new Error('Search failed');
    }

    const searchResults = await response.json();
    return {
      searchQuery,
      searchResults,
    };
  } catch {
    return {
      searchQuery,
      error: '検索に失敗しました',
    };
  }
}

export default function Search({loaderData}: Route.ComponentProps) {
  const {searchQuery, searchResults, error} = loaderData as {
    searchQuery: string;
    searchResults?: {
      movies: SearchMovieData[];
      pagination: SearchPaginationData;
    };
    error?: string;
  };

  const locale = 'ja';

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h2 className="font-display font-black text-2xl md:text-3xl tracking-tight mb-6">
          SEARCH
        </h2>

        {/* 検索フォーム */}
        <form method="get" className="mb-8">
          <div className="flex border-[3px] border-ink shadow-[var(--shadow-offset-sm)]">
            <input
              type="text"
              name="q"
              defaultValue={searchQuery}
              placeholder="映画タイトルを入力..."
              className="flex-1 bg-surface px-3 py-2.5 text-ink focus:outline-none"
            />
            <button
              type="submit"
              className="bg-ink text-paper font-display font-black px-4">
              GO
            </button>
          </div>
        </form>

        {/* エラー表示 */}
        {error && (
          <div className="border-[3px] border-ink p-4 mb-6">
            <p className="font-mono text-sm">{error}</p>
          </div>
        )}

        {/* 検索結果 */}
        {searchResults && (
          <div>
            <p className="font-mono text-xs text-ink-muted mb-4">
              {searchResults.pagination.total} RESULTS
            </p>

            {searchResults.movies.length === 0 ? (
              <div className="text-center py-12">
                <p className="font-mono text-sm">
                  検索結果が見つかりませんでした
                </p>
                <p className="font-mono text-xs text-ink-muted mt-2">
                  別のキーワードで検索してみてください
                </p>
              </div>
            ) : (
              <div>
                {searchResults.movies.map(item => {
                  const title =
                    item.translations?.find(t => t.languageCode === locale)
                      ?.content ??
                    item.translations?.[0]?.content ??
                    'Unknown Title';
                  const posterUrl = selectBestPoster(item.posterUrls, locale);

                  return (
                    <SearchRow
                      key={item.movieUid}
                      movie={{
                        uid: item.movieUid,
                        title,
                        year: item.movie.year,
                        posterUrl,
                      }}
                      locale={locale}
                    />
                  );
                })}
              </div>
            )}

            {/* ページネーション */}
            {searchResults.pagination.totalPages > 1 && (
              <div className="mt-8 flex justify-center gap-2">
                {searchResults.pagination.page > 1 && (
                  <a
                    href={`/search?q=${encodeURIComponent(searchQuery)}&page=${
                      searchResults.pagination.page - 1
                    }`}
                    className="font-mono text-xs border-[2px] border-ink px-4 py-2">
                    前のページ
                  </a>
                )}

                <span className="font-mono text-xs px-4 py-2">
                  {searchResults.pagination.page} /{' '}
                  {searchResults.pagination.totalPages}
                </span>

                {searchResults.pagination.page <
                  searchResults.pagination.totalPages && (
                  <a
                    href={`/search?q=${encodeURIComponent(searchQuery)}&page=${
                      searchResults.pagination.page + 1
                    }`}
                    className="font-mono text-xs border-[2px] border-ink px-4 py-2">
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
