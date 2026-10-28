import type {Route} from './+types/retired';

function destination(pathname: string): string {
  if (pathname.startsWith('/people/')) {
    return '/people';
  }

  if (pathname === '/daily' || pathname === '/weekly') {
    return '/monthly';
  }

  return '/awards';
}

export function loader({request}: Route.LoaderArgs) {
  return new Response(undefined, {
    status: 301,
    headers: {Location: destination(new URL(request.url).pathname)},
  });
}
