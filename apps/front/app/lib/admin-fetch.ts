import type {AdminMovieDetailData} from '@/lib/api-types';

const tokenKey = 'adminToken';

export function getAdminToken(): string | undefined {
  return globalThis.localStorage?.getItem(tokenKey) ?? undefined;
}

export function setAdminToken(token: string): void {
  globalThis.localStorage?.setItem(tokenKey, token);
  dispatchEvent(new Event('adminLogin'));
}

export function clearAdminToken(): void {
  globalThis.localStorage?.removeItem(tokenKey);
  dispatchEvent(new Event('adminLogout'));
}

export async function adminFetch(
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> {
  const token = getAdminToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, {...init, headers});

  if (response.status === 401) {
    clearAdminToken();
    location.assign('/admin/login');
  }

  return response;
}

export async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = (await response.json()) as {error?: string};
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export async function adminJson<T>(
  input: string | URL | Request,
  failureMessage: string,
  init?: RequestInit,
): Promise<T> {
  const response = await adminFetch(input, init);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, failureMessage));
  }

  return (await response.json()) as T;
}

export async function fetchAdminMovie(
  apiUrl: string,
  movieId: string,
): Promise<AdminMovieDetailData | undefined> {
  const response = await adminFetch(`${apiUrl}/admin/movies/${movieId}`);
  if (!response.ok) {
    return undefined;
  }

  return (await response.json()) as AdminMovieDetailData;
}
