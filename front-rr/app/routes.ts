import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('search', 'routes/search.tsx'),
  route('movies/:id', 'routes/movies.$id.tsx'),
  route('admin/login', 'routes/admin.login.tsx'),
  route('admin/movies', 'routes/admin.movies.tsx')
] satisfies RouteConfig;
