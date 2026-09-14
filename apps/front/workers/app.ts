import {createRequestHandler} from 'react-router';
import {createEnvironmentContext} from '@/lib/api';
import {isOgPath} from '@/og/paths';

const requestHandler = createRequestHandler(
  async () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

export default {
  async fetch(request, environment) {
    if (environment.OG && isOgPath(new URL(request.url).pathname)) {
      return environment.OG.fetch(request);
    }

    return requestHandler(
      request,
      createEnvironmentContext(environment, request),
    );
  },
} satisfies ExportedHandler<Env>;
