import AdminNav from '@/components/admin-nav';
import {AddMovieForm} from '@/components/admin/movies/add-movie-form';
import {MovieSearchCard} from '@/components/admin/movies/movie-search-card';
import {MoviesList} from '@/components/admin/movies/movies-list';
import type {Route} from './+types/admin.movies';
import {resolveApiUrl} from '@/lib/api';

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

  return {
    apiUrl: resolveApiUrl(context),
    page: Number(page),
    limit: Number(limit),
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

export default function AdminMovies({loaderData}: Route.ComponentProps) {
  const {apiUrl} = loaderData;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-semibold text-slate-900">
          Movies Management
        </h1>
        <AdminNav />
      </div>

      <MovieSearchCard />

      <AddMovieForm apiUrl={apiUrl} />

      <MoviesList apiUrl={apiUrl} />
    </div>
  );
}
