import {createRequestHandler} from 'react-router';
import {createEnvironmentContext} from '@/lib/api';

const requestHandler = createRequestHandler(
  async () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

export default {
  async fetch(request, environment) {
    return requestHandler(request, createEnvironmentContext(environment));
  },
} satisfies ExportedHandler<Env>;
