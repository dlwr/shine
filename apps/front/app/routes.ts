import {type RouteConfig, index, route} from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('search', 'routes/search.tsx'),
  route('movies/:id', 'routes/movies.$id.tsx'),
  route('awards', 'routes/awards.tsx'),
  route('awards/:slug', 'routes/awards.$slug.tsx'),
  route('robots.txt', 'routes/robots.tsx'),
  route('feed.xml', 'routes/feed.tsx'),
  route('sitemap.xml', 'routes/sitemap-index.tsx'),
  route('sitemap/movies.xml', 'routes/sitemap-movies.tsx'),
  route('sitemap/awards.xml', 'routes/sitemap-awards.tsx'),
  route('og/movie.png', 'routes/og-movie.tsx'),
  route('og/home.png', 'routes/og-home.tsx'),
  route('og/banner.png', 'routes/og-banner.tsx'),
  route('admin/login', 'routes/admin.login.tsx'),
  route('admin/movies', 'routes/admin.movies.tsx'),
  route('admin/movies/:id', 'routes/admin.movies.$id.tsx'),
  route('admin/movies/selections', 'routes/admin.movies.selections.tsx'),
  route('admin/ceremonies', 'routes/admin.ceremonies.tsx'),
  route('admin/ceremonies/:uid', 'routes/admin.ceremonies.$uid.tsx'),
] satisfies RouteConfig;
