import {createRequestHandler} from 'react-router';
import {createEnvironmentContext} from '@/lib/api';
import {isOgPath} from '@/og/paths';
import {serveOgWithCache} from '@/lib/og-cache';
import {
  htmlToMarkdownWith,
  serveMarkdown,
  prefersMarkdown,
  withMarkdownAlternate,
} from '@/lib/markdown-response';
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

    const render = async (pageRequest: Request) =>
      requestHandler(
        pageRequest,
        createEnvironmentContext(environment, pageRequest),
      );
    const ai = environment.AI;
    if (ai && prefersMarkdown(request)) {
      return serveMarkdown(request, {
        render,
        convert: htmlToMarkdownWith(ai),
        cache: await caches.open('markdown'),
        waitUntil(promise) {
          executionContext.waitUntil(promise);
        },
      });
    }

    return withMarkdownAlternate(request, await render(request));
  },
} satisfies ExportedHandler<Env>;
