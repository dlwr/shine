import {createContext, RouterContextProvider} from 'react-router';

export type FrontEnvironment = {
  PUBLIC_API_URL?: string;
  PUBLIC_TURNSTILE_SITE_KEY?: string;
  PUBLIC_WEB_ANALYTICS_TOKEN?: string;
  QUIZ_ANSWER_KEY?: string;
  API?: {
    fetch: (url: string, init?: RequestInit) => Promise<Response>;
  };
};

export type LoadContext = Readonly<RouterContextProvider>;

export const environmentContext = createContext<FrontEnvironment>({});

export function createEnvironmentContext(
  environment: FrontEnvironment,
): RouterContextProvider {
  const context = new RouterContextProvider();
  context.set(environmentContext, environment);
  return context;
}

export function resolveEnvironment(context: LoadContext): FrontEnvironment {
  return context.get(environmentContext);
}

export function resolveApiUrl(context: LoadContext): string {
  return resolveEnvironment(context).PUBLIC_API_URL ?? 'http://localhost:8787';
}

export function resolveQuizKey(context: LoadContext): string | undefined {
  return resolveEnvironment(context).QUIZ_ANSWER_KEY;
}

export async function apiFetch(
  context: LoadContext,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const environment = resolveEnvironment(context);
  const binding = environment.API;
  const url = binding
    ? `https://shine-api${path}`
    : `${resolveApiUrl(context)}${path}`;

  const start = Date.now();
  const response = await (binding
    ? binding.fetch(url, init)
    : fetch(url, init));

  console.log(
    JSON.stringify({
      event: 'api_fetch',
      path: path.split('?', 1)[0],
      status: response.status,
      via: binding ? 'binding' : 'url',
      durationMs: Date.now() - start,
    }),
  );

  return response;
}
