import {redirect} from 'react-router';
import {apiFetch, type LoadContext} from './api';

export async function submitArticleLink(
  context: LoadContext,
  movieId: string,
  request: Request,
) {
  try {
    const formData = await request.formData();

    const url = formData.get('url') as string;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const captchaToken = formData.get('captchaToken');

    if (!captchaToken || typeof captchaToken !== 'string' || !captchaToken) {
      return {
        success: false,
        error: '認証に失敗しました。少し待ってから再度お試しください。',
      };
    }

    const adminToken = formData.get('adminToken');
    const response = await apiFetch(
      context,
      `/movies/${movieId}/article-links`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(typeof adminToken === 'string' &&
            adminToken && {Authorization: `Bearer ${adminToken}`}),
        },
        body: JSON.stringify({
          url,
          title,
          description,
          captchaToken,
        }),
        signal: request.signal,
      },
    );

    if (response.ok) {
      return redirect(`/movies/${movieId}#article-links`, {status: 303});
    }

    let errorMessage = '投稿に失敗しました。';

    try {
      const errorData = (await response.json()) as {error?: string};
      errorMessage = errorData.error || errorMessage;
    } catch {
      // JSON でない場合はデフォルトメッセージをそのまま使う
    }

    return {
      success: false,
      error: errorMessage,
    };
  } catch {
    return {
      success: false,
      error: '投稿処理中にエラーが発生しました。',
    };
  }
}
