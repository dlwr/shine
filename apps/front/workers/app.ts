import {createRequestHandler} from 'react-router';
import {createEnvironmentContext} from '@/lib/api';
import {isOgPath} from '@/og/paths';
import {serveOgWithCache} from '@/lib/og-cache';
import {servePoster} from './posters';

const requestHandler = createRequestHandler(
  async () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

export default {
  async fetch(request, environment, executionContext) {
    const {pathname} = new URL(request.url);
    const og = environment.OG;
    if (og && isOgPath(pathname)) {
      return serveOgWithCache(
        request,
        async ogRequest => og.fetch(ogRequest),
        await caches.open('og'),
        promise => {
          executionContext.waitUntil(promise);
        },
      );
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
