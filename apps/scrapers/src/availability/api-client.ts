import {type FetchLike} from '@shine/availability';
import {type SelectionType} from './ensure-selection';

export function createApiClient(options: {
  apiUrl: string;
  adminPassword: string;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  let token: string | undefined;

  async function login(): Promise<string> {
    if (token) {
      return token;
    }

    const response = await fetchImpl(`${options.apiUrl}/auth/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({password: options.adminPassword}),
    });
    if (!response.ok) {
      throw new Error(`Login failed: HTTP ${response.status}`);
    }

    const body = (await response.json()) as {token: string};
    token = body.token;
    return token;
  }

  return {
    async getNextSelections(): Promise<
      Record<SelectionType, {uid: string; date: string}>
    > {
      const jwt = await login();
      const response = await fetchImpl(
        `${options.apiUrl}/admin/preview-selections?locale=ja`,
        {headers: {Authorization: `Bearer ${jwt}`}},
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch next selections: HTTP ${response.status}`,
        );
      }

      const body = (await response.json()) as Record<
        'nextDaily' | 'nextWeekly' | 'nextMonthly',
        {date: string; movie?: {uid: string}}
      >;
      const keys = {
        daily: 'nextDaily',
        weekly: 'nextWeekly',
        monthly: 'nextMonthly',
      } as const;

      const result = {} as Record<SelectionType, {uid: string; date: string}>;
      for (const type of Object.keys(keys) as SelectionType[]) {
        const preview = body[keys[type]];
        if (!preview?.movie?.uid) {
          throw new Error(`No next selection for ${type}`);
        }

        result[type] = {uid: preview.movie.uid, date: preview.date};
      }

      return result;
    },

    async reselect(
      type: SelectionType,
      excludeMovieUids: string[],
      date: string,
    ): Promise<string> {
      const jwt = await login();
      const response = await fetchImpl(`${options.apiUrl}/reselect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({type, locale: 'ja', excludeMovieUids, date}),
      });
      if (!response.ok) {
        throw new Error(`Reselect failed: HTTP ${response.status}`);
      }

      const body = (await response.json()) as {movie: {uid: string}};
      return body.movie.uid;
    },

    async refreshTmdbData(movieUid: string, imdbId: string): Promise<void> {
      const jwt = await login();
      const response = await fetchImpl(
        `${options.apiUrl}/admin/movies/${movieUid}/imdb-id`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({imdbId, refreshData: true}),
        },
      );
      if (!response.ok) {
        throw new Error(`TMDb refresh failed: HTTP ${response.status}`);
      }
    },
  };
}
