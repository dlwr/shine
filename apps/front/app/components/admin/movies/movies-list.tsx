import {memo, useEffect, useState} from 'react';
import {Button} from '@/components/ui/button';
import {adminJson, getAdminToken} from '@/lib/admin-fetch';
import {deleteMovie, mergeMovies, showMergeDialog} from './movie-actions';
import type {Movie, MoviesResponse, PaginationData} from './types';

const getUrlParameters = () => {
  const parameters = new URLSearchParams(location.search);
  return {
    search: parameters.get('search') || '',
    page: Number(parameters.get('page') || 1),
    limit: Number(parameters.get('limit') || 20),
  };
};

const goToPage = (page: number) => {
  if (globalThis.window === undefined) {
    return;
  }

  const parameters = new URLSearchParams(location.search);
  parameters.set('page', String(page));
  history.replaceState({}, '', `${location.pathname}?${parameters.toString()}`);
  dispatchEvent(new Event('urlchange'));
};

export const MoviesList = memo(({apiUrl}: {apiUrl: string}) => {
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

      if (!getAdminToken()) {
        location.assign('/admin/login');
        return;
      }

      setLoading(true);
      const {search, page, limit} = getUrlParameters();

      try {
        const searchParameter = search
          ? `&search=${encodeURIComponent(search)}`
          : '';
        const data = await adminJson<MoviesResponse>(
          `${apiUrl}/admin/movies?page=${page}&limit=${limit}${searchParameter}`,
          'Failed to fetch movies',
        );
        if (!data) {
          return;
        }

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

    addEventListener('urlchange', fetchMovies);
    addEventListener('refetchMovies', fetchMovies);
    return () => {
      removeEventListener('urlchange', fetchMovies);
      removeEventListener('refetchMovies', fetchMovies);
    };
  }, [apiUrl]); // Only depend on apiUrl, use custom event for URL changes

  const handleDelete = async (movieId: string, movieTitle: string) => {
    const success = await deleteMovie(movieId, movieTitle, apiUrl);
    if (!success) {
      return;
    }

    dispatchEvent(new CustomEvent('refetchMovies'));
  };

  // eslint-disable-next-line unicorn/no-declarations-before-early-exit -- 後続の分岐でも使うので前に置く
  const handleMerge = async (sourceId: string, sourceTitle: string) => {
    const targetId = showMergeDialog(sourceId, sourceTitle);
    if (!targetId) {
      return;
    }

    const success = await mergeMovies(sourceId, targetId, sourceTitle, apiUrl);
    if (!success) {
      return;
    }

    dispatchEvent(new CustomEvent('refetchMovies'));
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
                      {movie.mediaType === 'tv' && (
                        <span className="ml-2 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                          TV
                        </span>
                      )}
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
              if (pagination.page > 1) {
                goToPage(pagination.page - 1);
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
              if (pagination.page < pagination.totalPages) {
                goToPage(pagination.page + 1);
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
