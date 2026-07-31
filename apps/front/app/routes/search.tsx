import type {Route} from './+types/search';
import {Masthead} from '@/components/editorial/masthead';
import {SearchRow} from '@/components/editorial/search-row';
import {SiteFooter} from '@/components/editorial/site-footer';
import {selectBestPoster} from '@/lib/poster';
import type {PosterInfo} from '@/lib/poster';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {buildSocialMeta} from '@/lib/meta';
import {resolveApiUrl} from '@/lib/api';

type SearchMovieData = {
  uid: string;
  year?: number;
  originalLanguage?: string;
  imdbId?: string;
  title?: string;
  posterUrls?: PosterInfo[];
  hasNominations?: boolean;
};

type SearchPaginationData = {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export function meta({data}: Route.MetaArgs): Route.MetaDescriptors {
  const {searchQuery, locale} = data as {searchQuery: string; locale?: Locale};

  const copy = searchQuery
    ? {
        title: `「${searchQuery}」の検索結果 | SHINE`,
        description: `「${searchQuery}」に一致する映画を SHINE で探す。`,
      }
    : {
        title: '映画を検索 | SHINE',
        description:
          'タイトル・年代・受賞歴から、SHINE に収録された映画を検索できます。',
      };

  return [
    ...buildSocialMeta({
      ...copy,
      path: '/search',
      locale: locale ?? DEFAULT_LOCALE,
    }),
    {name: 'robots', content: 'noindex, follow'},
  ];
}

export async function loader({context, request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get('q') || '';
  const page = url.searchParams.get('page') || '1';
  const limit = url.searchParams.get('limit') || '20';
  const locale = getLocaleFromRequest(request);

  if (!searchQuery) {
    return {
      searchQuery: '',
      searchResults: undefined,
      locale,
    };
  }

  try {
    const apiUrl = resolveApiUrl(context);
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
      locale,
    };
  } catch {
    return {
      searchQuery,
      error: '検索に失敗しました',
      locale,
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
              {searchResults.pagination.totalCount} RESULTS
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
                  const posterUrl = selectBestPoster(item.posterUrls, locale);

                  return (
                    <SearchRow
                      key={item.uid}
                      movie={{
                        uid: item.uid,
                        title: item.title ?? 'Unknown Title',
                        year: item.year,
                        posterUrl,
                        hasWinner: item.hasNominations,
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
                {searchResults.pagination.hasPrevPage && (
                  <a
                    href={`/search?q=${encodeURIComponent(searchQuery)}&page=${
                      searchResults.pagination.currentPage - 1
                    }`}
                    className="font-mono text-xs border-[2px] border-ink px-4 py-2">
                    前のページ
                  </a>
                )}

                <span className="font-mono text-xs px-4 py-2">
                  {searchResults.pagination.currentPage} /{' '}
                  {searchResults.pagination.totalPages}
                </span>

                {searchResults.pagination.hasNextPage && (
                  <a
                    href={`/search?q=${encodeURIComponent(searchQuery)}&page=${
                      searchResults.pagination.currentPage + 1
                    }`}
                    className="font-mono text-xs border-[2px] border-ink px-4 py-2">
                    次のページ
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
