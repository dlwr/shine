import type {FetchLike, SourceCheckResult} from '../types';

type Provider = {provider_id?: number; provider_name?: string};

type WatchProvidersResponse = {
  results?: {
    JP?: {
      flatrate?: Provider[];
      rent?: Provider[];
      buy?: Provider[];
    };
  };
};

// Google Play Movies: 2024-01-17に日本でサービス終了したがJustWatch側のデータが残っている
const DEFUNCT_PROVIDER_IDS = new Set([3]);

const activeProviders = (providers: Provider[] | undefined) =>
  (providers ?? []).filter(
    p =>
      p.provider_id === undefined || !DEFUNCT_PROVIDER_IDS.has(p.provider_id),
  );

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
      ...activeProviders(jp?.flatrate).map(p => `${p.provider_name}(見放題)`),
      ...activeProviders(jp?.rent).map(p => `${p.provider_name}(レンタル)`),
      ...activeProviders(jp?.buy).map(p => `${p.provider_name}(購入)`),
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
