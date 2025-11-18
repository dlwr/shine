import {Turnstile} from '@marsidev/react-turnstile';
import {useCallback, useState, type ChangeEvent, type ElementType} from 'react';
import {Form, redirect} from 'react-router';
import type {Route} from './+types/movies.$id';
import {Button} from '@/components/ui/button';

type CloudflareContext = {
  env?: {
    PUBLIC_API_URL?: string;
    PUBLIC_TURNSTILE_SITE_KEY?: string;
  };
};

type MovieDetailData = {
  uid: string;
  year: number;
  originalLanguage: string;
  imdbId: string;
  tmdbId: number;
  imdbUrl?: string;
  posterUrl?: string;
  title: string;
  description?: string;
  nominations: Array<{
    uid: string;
    isWinner: boolean;
    specialMention?: string;
    category: {
      uid: string;
      name: string;
    };
    ceremony: {
      uid: string;
      number?: number;
      year: number;
    };
    organization: {
      uid: string;
      name: string;
      shortName?: string;
    };
  }>;
  articleLinks: Array<{
    uid: string;
    url: string;
    title: string;
    description?: string;
  }>;
};
type LoaderErrorResponse = {
  error: string;
  status?: number;
};

type LoaderSuccessResponse = {
  movieDetail: MovieDetailData;
  turnstileSiteKey?: string;
};

type LoaderData = LoaderErrorResponse | LoaderSuccessResponse;

function isLoaderError(data: LoaderData): data is LoaderErrorResponse {
  return 'error' in data;
}

function isLoaderSuccess(data: LoaderData): data is LoaderSuccessResponse {
  return 'movieDetail' in data;
}

type ArticleLinkFormState = {
  url: string;
  title: string;
  description: string;
  captchaToken: string;
};

type SubmissionResult = {error?: string} | undefined;

type ArticleLinkFormReturn = {
  formData: ArticleLinkFormState;
  handleInputChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  handleCaptchaTokenChange: (token: string) => void;
  isLoadingTitle: boolean;
  titleError: string;
  submissionResult: SubmissionResult;
};

function useIsTestMode(): boolean {
  return import.meta.env.MODE === 'test';
}

function useArticleLinkForm(
  isTestMode: boolean,
  actionData: Route.ComponentProps['actionData'],
): ArticleLinkFormReturn {
  const [formData, setFormData] = useState<ArticleLinkFormState>({
    url: '',
    title: '',
    description: '',
    captchaToken: isTestMode ? 'test-token' : '',
  });
  const [isLoadingTitle, setIsLoadingTitle] = useState(false);
  const [titleError, setTitleError] = useState('');
  const submissionResult = actionData as SubmissionResult;

  const fetchTitleFromUrl = useCallback(
    async (url: string) => {
      if (!url) {
        return;
      }

      try {
        void new URL(url);
      } catch {
        return;
      }

      setIsLoadingTitle(true);
      setTitleError('');

      try {
        const apiUrl = isTestMode
          ? 'http://localhost:8787'
          : 'https://shine-api.yuta25.workers.dev';
        const response = await fetch(`${apiUrl}/fetch-url-title`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({url}),
        });

        if (response.ok) {
          const data = (await response.json()) as {title?: string};
          setFormData(previous => ({
            ...previous,
            title: data.title ?? '',
          }));
        } else {
          setTitleError('タイトルの取得に失敗しました');
        }
      } catch {
        setTitleError('タイトルの取得中にエラーが発生しました');
      } finally {
        setIsLoadingTitle(false);
      }
    },
    [isTestMode],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const {name, value} = event.target;
      setFormData(previous => ({
        ...previous,
        [name]: value,
      }));

      if (name === 'url') {
        void fetchTitleFromUrl(value);
      }
    },
    [fetchTitleFromUrl],
  );

  const handleCaptchaTokenChange = useCallback((token: string) => {
    setFormData(previous => ({
      ...previous,
      captchaToken: token,
    }));
  }, []);

  return {
    formData,
    handleInputChange,
    handleCaptchaTokenChange,
    isLoadingTitle,
    titleError,
    submissionResult,
  };
}

type Nomination = MovieDetailData['nominations'][number];
type ArticleLink = MovieDetailData['articleLinks'][number];

function MovieDetailErrorView({
  error,
  status,
}: {
  error: string;
  status?: number;
}) {
  const title =
    status === 404 ? '映画が見つかりません' : 'エラーが発生しました';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        <h1 className="text-xl font-bold text-red-600 mb-4">{title}</h1>
        <p className="text-gray-700 mb-6">{error}</p>
        <a
          href="/"
          className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors">
          ホームに戻る
        </a>
      </div>
    </div>
  );
}

function MoviePosterSection({
  posterUrl,
  title,
}: {
  posterUrl?: string;
  title: string;
}) {
  return (
    <div className="lg:col-span-1">
      {posterUrl && (
        <img
          src={posterUrl}
          alt={title}
          className="w-full max-w-sm mx-auto rounded-lg shadow-lg"
        />
      )}
    </div>
  );
}

function MovieHeader({
  movieDetail,
  title,
}: {
  movieDetail: MovieDetailData;
  title: string;
}) {
  return (
    <header>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
      <div className="flex flex-wrap gap-4 text-gray-600">
        <span>{movieDetail.year}年</span>
        <span>IMDb: {movieDetail.imdbId}</span>
        {movieDetail.imdbUrl && (
          <a
            href={movieDetail.imdbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800">
            IMDbで見る
          </a>
        )}
      </div>
    </header>
  );
}

function NominationBadgeList({
  nominations,
  variant,
}: {
  nominations: Nomination[];
  variant: 'winner' | 'nominee';
}) {
  if (nominations.length === 0) {
    return <></>;
  }

  const baseClass =
    variant === 'winner'
      ? 'inline-block bg-yellow-400 text-yellow-900 px-3 py-2 rounded-lg mr-2 mb-2'
      : 'inline-block bg-gray-200 text-gray-800 px-3 py-2 rounded-lg mr-2 mb-2';
  const emoji = variant === 'winner' ? '🏆' : '🎬';
  const label = variant === 'winner' ? '受賞' : 'ノミネート';

  return (
    <>
      {nominations.map((nomination, index) => (
        <div key={index} className={baseClass}>
          {emoji} {nomination.organization.name} {nomination.ceremony.year}{' '}
          {label}
          <div className="text-xs mt-1">{nomination.category.name}</div>
        </div>
      ))}
    </>
  );
}

function NominationsSection({
  winningNominations,
  nominees,
}: {
  winningNominations: Nomination[];
  nominees: Nomination[];
}) {
  if (winningNominations.length === 0 && nominees.length === 0) {
    return <></>;
  }

  return (
    <section>
      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        受賞・ノミネート
      </h2>
      <div className="space-y-3">
        {/* 受賞 */}
        <NominationBadgeList
          nominations={winningNominations}
          variant="winner"
        />
        {/* ノミネート */}
        <NominationBadgeList nominations={nominees} variant="nominee" />
      </div>
    </section>
  );
}

type ArticleLinksSectionProperties = {
  articleLinks: ArticleLink[] | undefined;
  isTestMode: boolean;
  formData: ArticleLinkFormState;
  handleInputChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  handleCaptchaTokenChange: (token: string) => void;
  isLoadingTitle: boolean;
  titleError: string;
  submissionResult: SubmissionResult;
  turnstileSiteKey?: string;
};

function ArticleLinksSection({
  articleLinks,
  isTestMode,
  formData,
  handleInputChange,
  handleCaptchaTokenChange,
  isLoadingTitle,
  titleError,
  submissionResult,
  turnstileSiteKey,
}: ArticleLinksSectionProperties) {
  const FormRoot: ElementType = isTestMode ? 'form' : Form;
  const links = articleLinks ?? [];
  const [captchaError, setCaptchaError] = useState('');
  const hasSiteKey = Boolean(turnstileSiteKey);
  const isCaptchaRequired = hasSiteKey && !isTestMode;
  const isSubmitDisabled =
    (!isTestMode && !hasSiteKey) ||
    (isCaptchaRequired && formData.captchaToken === '');

  return (
    <section>
      <h2 className="text-xl font-semibold text-gray-800 mb-4">関連記事</h2>

      {/* 記事リンク一覧 */}
      <div className="space-y-4 mb-6">
        {links.length > 0 ? (
          links.map(article => (
            <div
              key={article.uid}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <h3 className="font-medium text-gray-900 mb-2">
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 transition-colors">
                  {article.title}
                </a>
              </h3>
              {article.description && (
                <p className="text-gray-600 text-sm mb-2">
                  {article.description}
                </p>
              )}
            </div>
          ))
        ) : (
          <p className="text-gray-500">まだ関連記事が投稿されていません。</p>
        )}
      </div>

      {/* 記事投稿フォーム */}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-lg font-medium text-gray-800 mb-4">
          記事を投稿する
        </h3>

        {submissionResult?.error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {submissionResult.error}
          </div>
        )}

        <FormRoot method="post" className="space-y-4">
          <input
            type="hidden"
            name="captchaToken"
            value={formData.captchaToken}
            readOnly
          />

          <div>
            <label
              htmlFor="url"
              className="block text-sm font-medium text-gray-700 mb-1">
              記事URL
            </label>
            <input
              type="url"
              id="url"
              name="url"
              value={formData.url}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://example.com/article"
            />
          </div>

          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-gray-700 mb-1">
              記事タイトル
              {isLoadingTitle && (
                <span className="ml-2 text-sm text-blue-600">取得中...</span>
              )}
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              required
              maxLength={200}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="記事のタイトルを入力"
            />
            {titleError && (
              <p className="mt-1 text-sm text-red-600">{titleError}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700 mb-1">
              記事の説明（任意）
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="記事の簡単な説明を入力（任意）"
            />
          </div>

          {hasSiteKey ? (
            isCaptchaRequired ? (
              <div className="space-y-2">
                <Turnstile
                  siteKey={turnstileSiteKey as string}
                  options={{action: 'submit-article-link'}}
                  onSuccess={token => {
                    handleCaptchaTokenChange(token ?? '');
                    setCaptchaError('');
                  }}
                  onError={() => {
                    handleCaptchaTokenChange('');
                    setCaptchaError('認証に失敗しました。再度お試しください。');
                  }}
                  onExpire={() => {
                    handleCaptchaTokenChange('');
                    setCaptchaError(
                      '認証の有効期限が切れました。再認証してください。',
                    );
                  }}
                  onUnsupported={() => {
                    handleCaptchaTokenChange('');
                    setCaptchaError(
                      'お使いの環境では認証が利用できません。別のブラウザをお試しください。',
                    );
                  }}
                />
                {captchaError && (
                  <p className="text-sm text-red-600">{captchaError}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                ローカルテストモードのため認証はスキップされます。
              </p>
            )
          ) : (
            <p className="text-sm text-red-600">
              認証キーが設定されていないため投稿できません。管理者にお問い合わせください。
            </p>
          )}

          <Button type="submit" disabled={isSubmitDisabled}>
            投稿する
          </Button>
        </FormRoot>
      </div>
    </section>
  );
}

export function meta({data}: Route.MetaArgs): Route.MetaDescriptors {
  const payload = data as LoaderData | undefined;

  if (payload && isLoaderError(payload) && payload.error) {
    return [
      {title: '映画が見つかりません | SHINE'},
      {
        name: 'description',
        content: '指定された映画は見つかりませんでした。',
      },
    ];
  }

  const movieDetail =
    payload && isLoaderSuccess(payload) ? payload.movieDetail : undefined;
  const title = movieDetail?.title || '映画詳細';

  return [
    {title: `${title} (${movieDetail?.year || ''}) | SHINE`},
    {
      name: 'description',
      content: `${title} (${movieDetail?.year || ''}年) の詳細情報。受賞歴、ポスター、その他の情報をご覧いただけます。`,
    },
  ];
}

export async function loader({
  context,
  params,
  request,
}: Route.LoaderArgs): Promise<LoaderData> {
  try {
    const cloudflareEnvironment = (
      context.cloudflare as CloudflareContext | undefined
    )?.env;
    const apiUrl =
      cloudflareEnvironment?.PUBLIC_API_URL ?? 'http://localhost:8787';
    const response = await fetch(`${apiUrl}/movies/${params.id}`, {
      signal: request.signal, // React Router v7推奨：abortシグナル
    });

    if (response.status === 404) {
      return {
        error: '映画が見つかりませんでした',
        status: 404,
      };
    }

    if (!response.ok) {
      return {
        error: 'データの取得に失敗しました',
        status: response.status,
      };
    }

    const movieDetail = (await response.json()) as MovieDetailData;
    const turnstileSiteKey = cloudflareEnvironment?.PUBLIC_TURNSTILE_SITE_KEY;
    return {movieDetail, turnstileSiteKey};
  } catch {
    return {
      error: 'APIへの接続に失敗しました',
      status: 500,
    };
  }
}

export async function action({context, params, request}: Route.ActionArgs) {
  try {
    const cloudflareEnvironment = (
      context.cloudflare as CloudflareContext | undefined
    )?.env;
    const apiUrl =
      cloudflareEnvironment?.PUBLIC_API_URL ?? 'http://localhost:8787';
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

    const response = await fetch(
      `${apiUrl}/movies/${params.id}/article-links`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      return redirect('/', {status: 303});
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

export default function MovieDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const isTestMode = useIsTestMode();
  const {
    formData,
    handleInputChange,
    handleCaptchaTokenChange,
    isLoadingTitle,
    titleError,
    submissionResult,
  } = useArticleLinkForm(isTestMode, actionData);

  const data = loaderData as LoaderData;

  if (isLoaderError(data)) {
    return (
      <MovieDetailErrorView
        error={data.error ?? '映画情報の取得に失敗しました'}
        status={data.status}
      />
    );
  }

  if (!isLoaderSuccess(data)) {
    return <MovieDetailErrorView error="映画情報が取得できませんでした" />;
  }

  const {movieDetail, turnstileSiteKey} = data;
  const title = movieDetail.title || 'タイトル不明';
  const {posterUrl} = movieDetail;
  const winningNominations =
    movieDetail.nominations?.filter(nomination => nomination.isWinner) ?? [];
  const nominees =
    movieDetail.nominations?.filter(nomination => !nomination.isWinner) ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <nav className="mb-8">
          <a
            href="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors">
            ← ホームに戻る
          </a>
        </nav>

        <div className="grid lg:grid-cols-3 gap-8">
          <MoviePosterSection posterUrl={posterUrl} title={title} />

          <div className="lg:col-span-2 space-y-6">
            <MovieHeader movieDetail={movieDetail} title={title} />

            <NominationsSection
              winningNominations={winningNominations}
              nominees={nominees}
            />

            <ArticleLinksSection
              articleLinks={movieDetail.articleLinks}
              isTestMode={isTestMode}
              formData={formData}
              handleInputChange={handleInputChange}
              handleCaptchaTokenChange={handleCaptchaTokenChange}
              isLoadingTitle={isLoadingTitle}
              titleError={titleError}
              submissionResult={submissionResult}
              turnstileSiteKey={turnstileSiteKey}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
