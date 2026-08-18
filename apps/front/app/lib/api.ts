import {createContext, RouterContextProvider} from 'react-router';

export type FrontEnvironment = {
  PUBLIC_API_URL?: string;
  PUBLIC_TURNSTILE_SITE_KEY?: string;
  PUBLIC_WEB_ANALYTICS_TOKEN?: string;
  QUIZ_ANSWER_KEY?: string;
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
