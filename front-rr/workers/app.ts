import { createRequestHandler } from 'react-router';

declare module 'react-router' {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE
);

export default {
  async fetch(request, environment, context) {
    return requestHandler(request, {
      cloudflare: { env: environment, ctx: context }
    });
  }
} satisfies ExportedHandler<Env>;
