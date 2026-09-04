import type {Route} from './+types/search';
import type {ProminentPerson} from '@/lib/people';
import {Masthead} from '@/components/editorial/masthead';
import {PeopleStrip} from '@/components/editorial/people-strip';
import {SearchBox} from '@/components/editorial/search-box';
import {SearchRow} from '@/components/editorial/search-row';
import {SiteFooter} from '@/components/editorial/site-footer';
import {selectBestPoster} from '@/lib/poster';
import type {PosterInfo} from '@/lib/poster';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {buildSocialMeta} from '@/lib/meta';
import {apiFetch, resolveApiUrl, type LoadContext} from '@/lib/api';

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

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const {searchQuery, locale} = loaderData as {
    searchQuery: string;
    locale?: Locale;
  };

  const copy = searchQuery
    ? {
        title: `「${searchQuery}」の検索結果 | なんか見る`,
        description: `「${searchQuery}」に一致する映画と映画人を「なんか見る」で探す。`,
      }
    : {
        title: '映画を検索 | なんか見る',
        description:
          '映画のタイトルや映画人の名前から、「なんか見る」に収録された映画と人物を検索できます。',
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
  const apiUrl = resolveApiUrl(context);

  if (!searchQuery) {
    return {
      searchQuery: '',
      searchResults: undefined,
      people: [] as ProminentPerson[],
      apiUrl,
      locale,
    };
  }

  const [searchResults, people] = await Promise.all([
    fetchMovies(context, searchQuery, page, limit, request.signal),
    page === '1'
      ? fetchPeople(context, searchQuery, request.signal)
      : Promise.resolve([]),
  ]);

  if (!searchResults) {
    return {
      searchQuery,
      error: '検索に失敗しました',
      people,
      apiUrl,
      locale,
    };
  }

  return {
    searchQuery,
    searchResults,
    people,
    apiUrl,
    locale,
  };
}

async function fetchMovies(
  context: LoadContext,
  searchQuery: string,
  page: string,
  limit: string,
  signal: AbortSignal,
) {
  try {
    const response = await apiFetch(
      context,
      `/movies/search?q=${encodeURIComponent(searchQuery)}&page=${page}&limit=${limit}`,
      {signal},
    );

    if (!response.ok) {
      return;
    }

    return (await response.json()) as {
      movies: SearchMovieData[];
      pagination: SearchPaginationData;
    };
  } catch {
    return;
  }
}

async function fetchPeople(
  context: LoadContext,
  searchQuery: string,
  signal: AbortSignal,
): Promise<ProminentPerson[]> {
  try {
    const response = await apiFetch(
      context,
      `/people/search?q=${encodeURIComponent(searchQuery)}&locale=ja`,
      {signal},
    );

    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as {people: ProminentPerson[]};
    return body.people;
  } catch {
    return [];
  }
}

export default function Search({loaderData}: Route.ComponentProps) {
  const {
    searchQuery,
    searchResults,
    people = [],
    apiUrl,
    error,
  } = loaderData as {
    searchQuery: string;
    searchResults?: {
      movies: SearchMovieData[];
      pagination: SearchPaginationData;
    };
    people?: ProminentPerson[];
    apiUrl: string;
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

        <div className="mb-8">
          <SearchBox
            apiUrl={apiUrl}
            label="映画と映画人を探す"
            placeholder="映画タイトル・人物名を入力..."
            defaultValue={searchQuery}
          />
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="border-[3px] border-ink p-4 mb-6">
            <p className="font-mono text-sm">{error}</p>
          </div>
        )}

        <PeopleStrip people={people} />

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
