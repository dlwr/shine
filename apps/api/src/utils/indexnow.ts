import {
  INDEXNOW_SITE_URL,
  submitIndexNow,
  type IndexNowFetch,
} from '@shine/utils/indexnow';

export async function notifyIndexNowMovieChanged(
  key: string,
  movieUid: string,
  fetchImpl: IndexNowFetch = fetch,
): Promise<void> {
  try {
    await submitIndexNow([`${INDEXNOW_SITE_URL}/movies/${movieUid}`], {
      key,
      fetchImpl,
    });
  } catch (error) {
    console.error('IndexNow への送信に失敗しました:', error);
  }
}
