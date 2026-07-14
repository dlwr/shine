import type {FetchLike, SourceCheckResult} from '../types';

type WatchProvidersResponse = {
  results?: {
    JP?: {
      flatrate?: Array<{provider_name?: string}>;
      rent?: Array<{provider_name?: string}>;
      buy?: Array<{provider_name?: string}>;
    };
  };
};

export async function checkTmdbProviders(
  tmdbId: number,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<SourceCheckResult> {
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers?api_key=${apiKey}`;

  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return {
        source: 'tmdb',
        status: 'error',
        detail: `HTTP ${response.status}`,
      };
    }

    const body = (await response.json()) as WatchProvidersResponse;
    const jp = body.results?.JP;
    const offerings = [
      ...(jp?.flatrate ?? []).map(p => `${p.provider_name}(見放題)`),
      ...(jp?.rent ?? []).map(p => `${p.provider_name}(レンタル)`),
      ...(jp?.buy ?? []).map(p => `${p.provider_name}(購入)`),
    ];

    return offerings.length > 0
      ? {source: 'tmdb', status: 'ok', detail: offerings.join(', ')}
      : {source: 'tmdb', status: 'ng', detail: 'No JP providers'};
  } catch (error) {
    return {
      source: 'tmdb',
      status: 'error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
