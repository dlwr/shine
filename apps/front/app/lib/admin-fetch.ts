const tokenKey = 'adminToken';

export function getAdminToken(): string | undefined {
  return globalThis.localStorage?.getItem(tokenKey) ?? undefined;
}

export function setAdminToken(token: string): void {
  globalThis.localStorage?.setItem(tokenKey, token);
  globalThis.dispatchEvent(new Event('adminLogin'));
}

export function clearAdminToken(): void {
  globalThis.localStorage?.removeItem(tokenKey);
  globalThis.dispatchEvent(new Event('adminLogout'));
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
