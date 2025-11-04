import {type RouteConfig, index, route} from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('search', 'routes/search.tsx'),
  route('movies/:id', 'routes/movies.$id.tsx'),
  route('admin/login', 'routes/admin.login.tsx'),
  route('admin/movies', 'routes/admin.movies.tsx'),
  route('admin/movies/:id', 'routes/admin.movies.$id.tsx'),
  route('admin/movies/selections', 'routes/admin.movies.selections.tsx'),
  route('admin/ceremonies', 'routes/admin.ceremonies.tsx'),
  route('admin/ceremonies/:uid', 'routes/admin.ceremonies.$uid.tsx'),
] satisfies RouteConfig;
