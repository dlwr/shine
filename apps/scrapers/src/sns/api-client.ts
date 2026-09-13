import process from 'node:process';
import {type AvailabilityEntry} from './availability-labels';
import {SITE_URL} from './site';

const PROMINENT_POOL_LIMIT = 200;

export type SelectionMovie = {
  uid: string;
  title?: string;
  year?: number;
  nominations?: Array<{
    organization: {name: string; shortName?: string; slug?: string};
  }>;
  availability?: AvailabilityEntry[];
};

export type Selections = {daily?: SelectionMovie; monthly?: SelectionMovie};

export type AwardSummary = {
  slug: string;
  name: string;
  organization: string;
  grouping: 'year' | 'list' | 'person';
  subAward?: boolean;
};

export type ProminentPerson = {
  uid: string;
  name: string;
  wonCount: number;
  nominatedCount: number;
  topMovies: Array<{uid: string; title?: string; year?: number}>;
};

function apiUrl(): string {
  return process.env.SHINE_API_URL ?? 'https://shine-api.yuta25.workers.dev';
}

export async function fetchSelections(): Promise<Selections> {
  const response = await fetch(`${apiUrl()}/?locale=ja`, {
    headers: {Origin: SITE_URL},
  });

  if (!response.ok) {
    throw new Error(`Selection API failed: HTTP ${response.status}`);
  }

  return (await response.json()) as Selections;
}

export function requireSelection(
  selections: Selections,
  type: 'daily' | 'monthly',
): SelectionMovie {
  const movie = selections[type];
  if (!movie?.uid || !movie.title) {
    throw new Error(`No ${type} selection found`);
  }

  return movie;
}

export async function fetchArticleLinkCount(movieUid: string): Promise<number> {
  const response = await fetch(`${apiUrl()}/movies/${movieUid}/article-links`, {
    headers: {Origin: SITE_URL},
  });

  if (!response.ok) {
    throw new Error(`Article links API failed: HTTP ${response.status}`);
  }

  const links = (await response.json()) as unknown[];
  return links.length;
}

export async function fetchNextMonthlyTitle(): Promise<string | undefined> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return undefined;
  }

  try {
    const loginResponse = await fetch(`${apiUrl()}/auth/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Origin: SITE_URL},
      body: JSON.stringify({password}),
    });
    if (!loginResponse.ok) {
      throw new Error(`Admin login failed: HTTP ${loginResponse.status}`);
    }

    const {token} = (await loginResponse.json()) as {token: string};
    const response = await fetch(
      `${apiUrl()}/admin/preview-selections?locale=ja`,
      {headers: {Authorization: `Bearer ${token}`, Origin: SITE_URL}},
    );
    if (!response.ok) {
      throw new Error(`Preview selections API failed: HTTP ${response.status}`);
    }

    const {nextMonthly} = (await response.json()) as {
      nextMonthly?: {movie?: {title?: string}};
    };
    return nextMonthly?.movie?.title;
  } catch (error) {
    console.log('来月の1本が取れないため予告を省きます:', error);
    return undefined;
  }
}

export async function fetchQuizPuzzle(): Promise<{
  date: string;
  poolSize: number;
}> {
  const response = await fetch(`${apiUrl()}/quiz/daily`, {
    headers: {Origin: SITE_URL},
  });

  if (!response.ok) {
    throw new Error(`Quiz API failed: HTTP ${response.status}`);
  }

  return (await response.json()) as {date: string; poolSize: number};
}

export async function fetchAwardPages(): Promise<AwardSummary[]> {
  const response = await fetch(`${apiUrl()}/awards`, {
    headers: {Origin: SITE_URL},
  });

  if (!response.ok) {
    throw new Error(`Awards API failed: HTTP ${response.status}`);
  }

  const {awards} = (await response.json()) as {awards: AwardSummary[]};
  return awards;
}

export async function fetchAwardPagesQuietly(): Promise<AwardSummary[]> {
  try {
    return await fetchAwardPages();
  } catch (error) {
    console.log('賞ページ一覧が取れないため団体名は原語のまま:', error);
    return [];
  }
}

export async function fetchWatchedLists(): Promise<AwardSummary[]> {
  const awards = await fetchAwardPages();
  return awards.filter(award => award.grouping === 'year' && !award.subAward);
}

export async function fetchWinnerCount(slug: string): Promise<number> {
  const response = await fetch(`${apiUrl()}/awards/${slug}`, {
    headers: {Origin: SITE_URL},
  });

  if (!response.ok) {
    throw new Error(`Award API failed: HTTP ${response.status}`);
  }

  const {years} = (await response.json()) as {
    years: Array<{movies: Array<{isWinner: boolean}>}>;
  };
  let count = 0;
  for (const group of years) {
    count += group.movies.filter(movie => movie.isWinner).length;
  }

  return count;
}

export async function fetchProminentPeople(): Promise<{
  directors: ProminentPerson[];
  actors: ProminentPerson[];
}> {
  const response = await fetch(
    `${apiUrl()}/people/prominent?locale=ja&limit=${PROMINENT_POOL_LIMIT}`,
    {headers: {Origin: SITE_URL}},
  );

  if (!response.ok) {
    throw new Error(`Prominent people API failed: HTTP ${response.status}`);
  }

  return (await response.json()) as {
    directors: ProminentPerson[];
    actors: ProminentPerson[];
  };
}
