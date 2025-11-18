import {useCallback, useEffect, useState, memo, type FormEvent} from 'react';
import {useSearchParams} from 'react-router';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import type {Route} from './+types/admin.movies';

type Movie = {
  uid: string;
  title: string;
  year: number | undefined;
  originalLanguage: string | undefined;
  posterUrl: string | undefined;
  imdbUrl?: string;
};

type PaginationData = {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
};

type MoviesResponse = {
  movies: Movie[];
  pagination: PaginationData;
};

type CreateMovieResponse = {
  success?: boolean;
  movie?: {
    uid: string;
    imdbId?: string | null;
    tmdbId?: number | null;
    year?: number | null;
    originalLanguage?: string | null;
  };
  imports?: {
    translationsAdded: number;
    postersAdded: number;
  };
  error?: string;
};

type CloudflareContext = {
  env?: {
    PUBLIC_API_URL?: string;
  };
};

type SearchTimeoutGlobal = typeof globalThis & {
  searchTimeout?: ReturnType<typeof setTimeout>;
};

const globalWithSearchTimeout = globalThis as SearchTimeoutGlobal;

const getUrlParameters = () => {
  const parameters = new URLSearchParams(globalThis.location.search);
  return {
    search: parameters.get('search') || '',
    page: Number(parameters.get('page') || 1),
    limit: Number(parameters.get('limit') || 20),
  };
};

export function meta(): Route.MetaDescriptors {
  return [
    {title: '映画管理 | SHINE Admin'},
    {name: 'description', content: '映画データベースの管理画面'},
  ];
}

export async function loader({context, request}: Route.LoaderArgs) {
  // 認証チェックはクライアントサイドで行う
  const url = new URL(request.url);
  const page = url.searchParams.get('page') || '1';
  const limit = url.searchParams.get('limit') || '20';
  const search = url.searchParams.get('search') || '';

  const cloudflareEnvironment = (
    context.cloudflare as CloudflareContext | undefined
  )?.env;
  return {
    apiUrl: cloudflareEnvironment?.PUBLIC_API_URL ?? 'http://localhost:8787',
    page: Number.parseInt(page, 10),
    limit: Number.parseInt(limit, 10),
    search,
    movies: [],
    pagination: {
      page: 1,
      limit: 20,
      totalCount: 0,
      totalPages: 0,
    },
  };
}

// Movies list component that reads directly from URL
const MoviesList = memo(({apiUrl}: {apiUrl: string}) => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 20,
    totalCount: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  // Fetch movies based on URL params
  useEffect(() => {
    const fetchMovies = async () => {
      if (globalThis.window === undefined) {
        return;
      }

      const token = globalThis.localStorage.getItem('adminToken');
      if (!token) {
        globalThis.location.href = '/admin/login';
        return;
      }

      setLoading(true);
      const {search, page, limit} = getUrlParameters();

      try {
        const searchParameter = search
          ? `&search=${encodeURIComponent(search)}`
          : '';
        const response = await fetch(
          `${apiUrl}/admin/movies?page=${page}&limit=${limit}${searchParameter}`,
          {
            headers: {Authorization: `Bearer ${token}`},
          },
        );

        if (response.status === 401) {
          globalThis.localStorage.removeItem('adminToken');
          globalThis.location.href = '/admin/login';
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch movies');
        }

        const data = (await response.json()) as MoviesResponse;
        setMovies(data.movies || []);
        setPagination(
          data.pagination || {
            page: 1,
            limit: 20,
            totalCount: 0,
            totalPages: 0,
          },
        );
      } catch (error) {
        console.error('Error loading movies:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchMovies();

    // Listen for URL changes
    const handleUrlChange = async () => fetchMovies();
    const handleRefetch = async () => fetchMovies();
    globalThis.addEventListener('urlchange', handleUrlChange);
    globalThis.addEventListener('refetchMovies', handleRefetch);
    return () => {
      globalThis.removeEventListener('urlchange', handleUrlChange);
      globalThis.removeEventListener('refetchMovies', handleRefetch);
    };
  }, [apiUrl]); // Only depend on apiUrl, use custom event for URL changes

  const handleDelete = async (movieId: string, movieTitle: string) => {
    const success = await deleteMovie(movieId, movieTitle, apiUrl);
    if (success) {
      // Re-fetch movies
      const event = new CustomEvent('refetchMovies');
      globalThis.dispatchEvent(event);
    }
  };

  const handleMerge = async (sourceId: string, sourceTitle: string) => {
    const targetId = showMergeDialog(sourceId, sourceTitle);
    if (targetId) {
      const success = await mergeMovies(
        sourceId,
        targetId,
        sourceTitle,
        apiUrl,
      );
      if (success) {
        // Re-fetch movies
        const event = new CustomEvent('refetchMovies');
        globalThis.dispatchEvent(event);
      }
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500">
        Loading movies...
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 p-12 text-center text-sm text-slate-500">
        No movies found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Poster</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {movies.map(movie => (
                <tr
                  key={movie.uid}
                  className="border-b border-slate-100 text-sm transition hover:bg-slate-50">
                  <td className="px-4 py-4">
                    {movie.posterUrl ? (
                      <img
                        src={movie.posterUrl}
                        alt={movie.title}
                        className="h-20 w-16 rounded-md object-cover shadow-sm"
                      />
                    ) : (
                      <div className="h-20 w-16 rounded-md border border-dashed border-slate-200 bg-slate-100" />
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-900">
                      {movie.title}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {movie.year || 'N/A'}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {movie.originalLanguage || 'N/A'}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <a href={`/admin/movies/${movie.uid}`}>Edit</a>
                      </Button>
                      {movie.imdbUrl && (
                        <Button asChild size="sm" variant="secondary">
                          <a
                            href={movie.imdbUrl}
                            target="_blank"
                            rel="noopener noreferrer">
                            IMDb
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () =>
                          handleDelete(movie.uid, movie.title)
                        }>
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-slate-700 text-white hover:bg-slate-600"
                        onClick={async () =>
                          handleMerge(movie.uid, movie.title)
                        }>
                        Merge
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl border border-dashed border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page === 1}
            onClick={() => {
              if (pagination.page > 1 && globalThis.window !== undefined) {
                const parameters = new URLSearchParams(
                  globalThis.location.search,
                );
                parameters.set('page', String(pagination.page - 1));
                const newUrl = `${globalThis.location.pathname}?${parameters.toString()}`;
                globalThis.history.replaceState({}, '', newUrl);
                globalThis.dispatchEvent(new Event('urlchange'));
              }
            }}
            className="min-w-[120px]">
            Previous
          </Button>
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page === pagination.totalPages}
            onClick={() => {
              if (
                pagination.page < pagination.totalPages &&
                globalThis.window !== undefined
              ) {
                const parameters = new URLSearchParams(
                  globalThis.location.search,
                );
                parameters.set('page', String(pagination.page + 1));
                const newUrl = `${globalThis.location.pathname}?${parameters.toString()}`;
                globalThis.history.replaceState({}, '', newUrl);
                globalThis.dispatchEvent(new Event('urlchange'));
              }
            }}
            className="min-w-[120px]">
            Next
          </Button>
        </div>
      )}
    </div>
  );
});

MoviesList.displayName = 'MoviesList';

const handleLogout = () => {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    globalThis.localStorage.removeItem('adminToken');
    globalThis.location.href = '/admin/login';
  }
};

const deleteMovie = async (
  movieId: string,
  movieTitle: string,
  apiUrl: string,
) => {
  if (
    !globalThis.confirm?.(
      `Are you sure you want to delete "${movieTitle}"? This action cannot be undone.`,
    )
  ) {
    return false;
  }

  const token = globalThis.localStorage?.getItem('adminToken');
  if (!token) {
    return false;
  }

  try {
    const response = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      globalThis.localStorage?.removeItem('adminToken');
      globalThis.location.href = '/admin/login';
      return false;
    }

    if (!response.ok) {
      throw new Error('Failed to delete movie');
    }

    alert(`Movie "${movieTitle}" has been deleted successfully.`);
    return true;
  } catch (error) {
    alert('Failed to delete movie. Please try again.');
    console.error('Delete error:', error);
    return false;
  }
};

const showMergeDialog = (sourceId: string, sourceTitle: string) => {
  const targetId = globalThis.prompt?.(
    `映画「${sourceTitle}」を他の映画にマージします。\n\nマージ先の映画IDを入力してください：`,
  );

  if (targetId?.trim()) {
    const confirmed = globalThis.confirm?.(
      '確認：\n\n' +
        `マージ元: ${sourceTitle} (${sourceId})\n` +
        `マージ先: ${targetId.trim()}\n\n` +
        'マージ元の映画とそのデータは削除されます。\n' +
        'この操作は取り消せません。\n\n' +
        '続行しますか？',
    );

    if (confirmed) {
      return targetId.trim();
    }
  }

  return;
};

const mergeMovies = async (
  sourceId: string,
  targetId: string,
  sourceTitle: string,
  apiUrl: string,
) => {
  const token = globalThis.localStorage?.getItem('adminToken');
  if (!token) {
    return false;
  }

  try {
    const response = await fetch(
      `${apiUrl}/admin/movies/${sourceId}/merge/${targetId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      const errorData = (await response.json()) as {error?: string};
      throw new Error(
        errorData.error || `HTTP error! status: ${response.status}`,
      );
    }

    alert(`Movie "${sourceTitle}" has been successfully merged.`);
    return true;
  } catch (error) {
    alert(
      `Failed to merge movie: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );
    console.error('Merge error:', error);
    return false;
  }
};

export default function AdminMovies({loaderData}: Route.ComponentProps) {
  const {apiUrl} = loaderData as {
    apiUrl: string;
    page: number;
    limit: number;
    search: string;
    movies: Movie[];
    pagination: PaginationData;
  };

  const [searchParameters] = useSearchParams();

  // Get current search from URL params
  const currentSearch = searchParameters.get('search') || '';

  const [newImdbId, setNewImdbId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>();
  const [createSuccess, setCreateSuccess] = useState<string | undefined>();

  // Handle search - only update URL
  const handleSearch = useCallback(
    (query: string) => {
      // Update URL without causing React Router re-render
      if (globalThis.window !== undefined) {
        const newParameters = new URLSearchParams(searchParameters);
        if (query) {
          newParameters.set('search', query);
        } else {
          newParameters.delete('search');
        }

        newParameters.set('page', '1');

        const newUrl = `${globalThis.location.pathname}?${newParameters.toString()}`;
        globalThis.history.replaceState({}, '', newUrl);
        // Trigger custom event to update MoviesList
        globalThis.dispatchEvent(new Event('urlchange'));
      }
    },
    [searchParameters],
  );

  const submitNewMovie = async () => {
    const trimmedImdbId = newImdbId.trim().toLowerCase();

    if (!trimmedImdbId) {
      setCreateError('Please enter an IMDb ID.');
      return;
    }

    if (!/^tt\d+$/.test(trimmedImdbId)) {
      setCreateError("IMDb ID must look like 'tt1234567'.");
      return;
    }

    const token = globalThis.localStorage?.getItem('adminToken');
    if (!token) {
      globalThis.location.href = '/admin/login';
      return;
    }

    setIsCreating(true);
    setCreateError(undefined);
    setCreateSuccess(undefined);

    try {
      const response = await fetch(`${apiUrl}/admin/movies`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imdbId: trimmedImdbId,
          refreshData: true,
        }),
      });

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
        return;
      }

      const data = (await response.json()) as CreateMovieResponse;

      if (!response.ok || !data.success) {
        setCreateError(data.error || 'Failed to create movie.');
        return;
      }

      const translations = data.imports?.translationsAdded ?? 0;
      const posters = data.imports?.postersAdded ?? 0;
      const importSummary =
        translations > 0 || posters > 0
          ? ` (translations: ${translations}, posters: ${posters})`
          : '';

      setCreateSuccess(`Movie created successfully${importSummary}.`);
      setNewImdbId('');

      globalThis.dispatchEvent(new Event('refetchMovies'));
    } catch (error) {
      console.error('Create movie error:', error);
      setCreateError('Failed to create movie. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateMovie = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitNewMovie();
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-semibold text-slate-900">
          Movies Management
        </h1>
        <div className="flex flex-wrap gap-3">
          <Button
            asChild
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-500">
            <a href="/">トップページ</a>
          </Button>
          <Button
            asChild
            size="sm"
            className="bg-sky-600 text-white hover:bg-sky-500">
            <a href="/admin/ceremonies">セレモニー管理</a>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <a href="/admin/movies/selections">Movie Selections</a>
          </Button>
          <Button size="sm" variant="destructive" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle>作品検索</CardTitle>
          <CardDescription>
            タイトルの一部を入力すると URL
            パラメーターが更新され、一覧が自動的に再取得されます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-xl">
            <Input
              type="text"
              defaultValue={currentSearch}
              placeholder="Search movies by title..."
              aria-label="Search movies"
              onChange={event => {
                const {value} = event.target;
                if (globalWithSearchTimeout.searchTimeout) {
                  clearTimeout(globalWithSearchTimeout.searchTimeout);
                }
                globalWithSearchTimeout.searchTimeout = setTimeout(() => {
                  handleSearch(value);
                }, 300);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Add Movie by IMDb ID</CardTitle>
          <CardDescription>
            Enter an IMDb ID (e.g., tt1234567). TMDB data is fetched
            automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={handleCreateMovie}
            className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label
                htmlFor="new-movie-imdb-id"
                className="text-sm font-medium text-slate-600">
                IMDb ID
              </Label>
              <Input
                id="new-movie-imdb-id"
                type="text"
                value={newImdbId}
                onChange={event => {
                  setNewImdbId(event.target.value);
                  if (createError) {
                    setCreateError(undefined);
                  }
                  if (createSuccess) {
                    setCreateSuccess(undefined);
                  }
                }}
                placeholder="tt1234567"
                inputMode="text"
                required
                autoComplete="off"
                className="mt-2"
              />
            </div>
            <Button
              type="submit"
              disabled={isCreating}
              className="sm:h-10 sm:min-w-[160px]">
              {isCreating ? 'Registering...' : 'Register Movie'}
            </Button>
          </form>
          {createError && (
            <p className="text-sm text-destructive">{createError}</p>
          )}
          {createSuccess && (
            <p className="text-sm text-emerald-600">{createSuccess}</p>
          )}
        </CardContent>
      </Card>

      <MoviesList apiUrl={apiUrl} />
    </div>
  );
}
