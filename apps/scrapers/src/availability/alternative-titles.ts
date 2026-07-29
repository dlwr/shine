import type {FetchLike} from './types';

type AlternativeTitlesResponse = {
  titles?: Array<{iso_3166_1?: string; title?: string}>;
};

// U-NEXTやDISCASは邦題の別表記(副題付きなど)で登録されていることがあるため、
// TMDbのJP別題を照合対象に加える。取得できなくてもチェックは継続する。
export async function fetchJapaneseAlternativeTitles(
  tmdbId: number,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<string[]> {
  if (!apiKey) {
    return [];
  }

  const url = `https://api.themoviedb.org/3/movie/${tmdbId}/alternative_titles?api_key=${apiKey}`;

  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as AlternativeTitlesResponse;
    const japaneseTitles = (body.titles ?? [])
      .filter(entry => entry.iso_3166_1 === 'JP')
      .map(entry => entry.title?.trim() ?? '')
      .filter(title => title !== '');

    return [...new Set(japaneseTitles)];
  } catch (error) {
    console.error(`Failed to fetch alternative titles for ${tmdbId}:`, error);
    return [];
  }
}
