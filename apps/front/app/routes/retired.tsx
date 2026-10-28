import type {Route} from './+types/retired';

export function loader({request}: Route.LoaderArgs) {
  const {pathname} = new URL(request.url);
  return new Response(undefined, {
    status: 301,
    headers: {
      Location: pathname.startsWith('/people/') ? '/people' : '/awards',
    },
  });
}
