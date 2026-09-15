import {createRequestHandler} from 'react-router';
import {createEnvironmentContext} from '@/lib/api';
import {isOgPath} from '@/og/paths';
import {servePoster} from './posters';

const requestHandler = createRequestHandler(
  async () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

export default {
  async fetch(request, environment) {
    const {pathname} = new URL(request.url);
    if (environment.OG && isOgPath(pathname)) {
      return environment.OG.fetch(request);
    }

    if (pathname.startsWith('/posters/')) {
      return servePoster(pathname);
    }

    return requestHandler(
      request,
      createEnvironmentContext(environment, request),
    );
  },
} satisfies ExportedHandler<Env>;
