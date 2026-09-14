import {adminFetch, getAdminToken} from '@/lib/admin-fetch';

export const deleteMovie = async (
  movieId: string,
  movieTitle: string,
  apiUrl: string,
) => {
  if (
    !globalThis.confirm?.(
      `Are you sure you want to delete "${movieTitle}"? This action cannot be undone.`,
    )
  ) {
    return false;
  }

  if (!getAdminToken()) {
    return false;
  }

  try {
    const response = await adminFetch(`${apiUrl}/admin/movies/${movieId}`, {
      method: 'DELETE',
    });

    if (response.status === 401) {
      return false;
    }

    if (!response.ok) {
      throw new Error('Failed to delete movie');
    }

    alert(`Movie "${movieTitle}" has been deleted successfully.`);
    return true;
  } catch (error) {
    alert('Failed to delete movie. Please try again.');
    console.error('Delete error:', error);
    return false;
  }
};

export const showMergeDialog = (
  sourceId: string,
  sourceTitle: string,
): string | undefined => {
  const targetId = globalThis.prompt?.(
    `映画「${sourceTitle}」を他の映画にマージします。\n\nマージ先の映画IDを入力してください：`,
  );

  if (!targetId?.trim()) {
    return undefined;
  }

  const confirmed = globalThis.confirm?.(
    '確認：\n\n' +
      `マージ元: ${sourceTitle} (${sourceId})\n` +
      `マージ先: ${targetId.trim()}\n\n` +
      'マージ元の映画とそのデータは削除されます。\n' +
      'この操作は取り消せません。\n\n' +
      '続行しますか？',
  );

  return confirmed ? targetId.trim() : undefined;
};

export const mergeMovies = async (
  sourceId: string,
  targetId: string,
  sourceTitle: string,
  apiUrl: string,
) => {
  if (!getAdminToken()) {
    return false;
  }

  try {
    const response = await adminFetch(
      `${apiUrl}/admin/movies/${sourceId}/merge/${targetId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      const errorData = (await response.json()) as {error?: string};
      throw new Error(
        errorData.error || `HTTP error! status: ${response.status}`,
      );
    }

    alert(`Movie "${sourceTitle}" has been successfully merged.`);
    return true;
  } catch (error) {
    alert(
      `Failed to merge movie: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    );
    console.error('Merge error:', error);
    return false;
  }
};
