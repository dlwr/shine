import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from 'react-router';
import type {Route} from './+types/root';
import './app.css';
import {NO_FLASH_SCRIPT} from '@/lib/theme';
import {DEFAULT_LOCALE, getLocaleFromRequest} from '@/lib/locale';
import {SITE_URL} from '@/lib/meta';

export function loader({context, request}: Route.LoaderArgs) {
  const {pathname} = new URL(request.url);
  const environment = (
    context.cloudflare as {env?: {PUBLIC_WEB_ANALYTICS_TOKEN?: string}}
  )?.env;

  return {
    locale: getLocaleFromRequest(request),
    canonicalUrl: new URL(pathname, SITE_URL).toString(),
    webAnalyticsToken: environment?.PUBLIC_WEB_ANALYTICS_TOKEN || undefined,
  };
}

export function headers(): HeadersInit {
  return {Vary: 'Accept-Language'};
}

export const links: Route.LinksFunction = () => [
  {rel: 'preconnect', href: 'https://fonts.googleapis.com'},
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
  },
  {
    rel: 'preload',
    href: '/fonts/space-grotesk.woff2',
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'preload',
    href: '/fonts/jetbrains-mono.woff2',
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  },
];

export function Layout({children}: {children: React.ReactNode}) {
  const rootData = useRouteLoaderData<typeof loader>('root');
  const locale = rootData?.locale ?? DEFAULT_LOCALE;
  const canonicalUrl = rootData?.canonicalUrl;
  const webAnalyticsToken = rootData?.webAnalyticsToken;

  return (
    <html lang={locale} className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <script dangerouslySetInnerHTML={{__html: NO_FLASH_SCRIPT}} />
        <Meta />
        <Links />
      </head>
      <body className="m-0 w-full h-full bg-paper text-ink font-body">
        {children}
        <ScrollRestoration />
        <Scripts />
        {webAnalyticsToken && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({token: webAnalyticsToken})}
          />
        )}
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({error}: Route.ErrorBoundaryProps) {
  let message = 'Oops!';
  let details = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error';
    details =
      error.status === 404
        ? 'The requested page could not be found.'
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
