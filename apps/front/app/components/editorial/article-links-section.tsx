import {Turnstile} from '@marsidev/react-turnstile';
import {useState, type ChangeEvent, type ElementType} from 'react';
import {Form} from 'react-router';
import {Button} from '@/components/ui/button';
import {useAdminToken} from '@/hooks/use-admin-token';
import type {
  ArticleLinkFormState,
  SubmissionResult,
} from '@/hooks/use-article-link-form';
import {SITE_URL} from '@/lib/meta';

export type ArticleLink = {
  uid: string;
  url?: string;
  title?: string;
  description?: string;
};

export function buildShareUrls(
  movieUid: string,
  movieTitle: string,
): {x: string; bluesky: string} {
  const text = encodeURIComponent(
    `『${movieTitle}』を観た\n${SITE_URL}/movies/${movieUid}`,
  );

  return {
    x: `https://x.com/intent/post?text=${text}`,
    bluesky: `https://bsky.app/intent/compose?text=${text}`,
  };
}

type ArticleLinksSectionProperties = {
  articleLinks: ArticleLink[] | undefined;
  movieUid: string;
  movieTitle: string;
  isTestMode: boolean;
  formData: ArticleLinkFormState;
  handleInputChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  handleCaptchaTokenChange: (token: string) => void;
  isLoadingTitle: boolean;
  submissionResult: SubmissionResult;
  turnstileSiteKey?: string;
  isMonthlyPick?: boolean;
};

export function ArticleLinksSection({
  articleLinks,
  movieUid,
  movieTitle,
  isTestMode,
  formData,
  handleInputChange,
  handleCaptchaTokenChange,
  isLoadingTitle,
  submissionResult,
  turnstileSiteKey,
  isMonthlyPick = false,
}: ArticleLinksSectionProperties) {
  const FormRoot: ElementType = isTestMode ? 'form' : Form;
  const links = articleLinks ?? [];
  const [captchaError, setCaptchaError] = useState('');
  const hasSiteKey = Boolean(turnstileSiteKey);
  const isCaptchaRequired = hasSiteKey && !isTestMode;
  const isEmpty = !formData.description.trim() && !formData.url.trim();
  const isSubmitDisabled =
    isEmpty ||
    (!isTestMode && !hasSiteKey) ||
    (isCaptchaRequired && formData.captchaToken === '');
  const shareUrls = buildShareUrls(movieUid, movieTitle);
  const adminToken = useAdminToken();

  return (
    <section id="article-links">
      <p className="font-mono text-xs text-ink-muted mb-3">
        観た人の記事・ポスト
      </p>

      {/* 記事リンク一覧 */}
      <div className="space-y-2 mb-6">
        {links.length > 0 ? (
          links.map(article => (
            <div
              key={article.uid}
              className="border-l-[3px] border-brand bg-surface px-3 py-1.5 text-sm">
              {article.url ? (
                <>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-ink hover:text-brand transition-colors">
                    {article.title ?? article.url}
                  </a>
                  {article.description && (
                    <p className="text-ink-muted text-xs mt-0.5">
                      {article.description}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-ink">{article.description}</p>
              )}
            </div>
          ))
        ) : (
          <div className="border-2 border-dashed border-ink/30 px-4 py-3">
            <p className="text-ink text-sm font-medium">
              まだ誰も書いていません。
            </p>
            {isMonthlyPick && (
              <p className="text-ink text-sm">
                今月はみんなでこの1本を観ています。
              </p>
            )}
            <p className="text-ink-muted text-xs mt-1">
              最初の一人になってください。一行の感想でも、X や Bluesky
              に書いたポストの URL でもかまいません。
            </p>
          </div>
        )}
      </div>

      {/* 記事投稿フォーム */}
      <div className="border-t border-ink/20 pt-6">
        <h2 className="text-lg font-medium text-ink mb-1">
          観たら、ひとこと残す
        </h2>
        <p className="text-sm text-ink-muted mb-4">
          短くていい。よそに書いたなら、その URL も貼れる。
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <a
            href={shareUrls.x}
            target="_blank"
            rel="noopener noreferrer"
            className="border-2 border-ink px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-surface transition-colors">
            X に書く
          </a>
          <a
            href={shareUrls.bluesky}
            target="_blank"
            rel="noopener noreferrer"
            className="border-2 border-ink px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-surface transition-colors">
            Bluesky に書く
          </a>
        </div>

        {submissionResult?.error && (
          <div className="mb-4 p-3 bg-brand/10 border border-brand text-brand">
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
          {adminToken && (
            <input
              type="hidden"
              name="adminToken"
              value={adminToken}
              readOnly
            />
          )}

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-ink mb-1">
              ひとこと
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 border-2 border-ink focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="観てどうだったか。一行でいい"
            />
          </div>

          <div>
            <label
              htmlFor="url"
              className="block text-sm font-medium text-ink mb-1">
              URL（任意）
            </label>
            <input
              type="url"
              id="url"
              name="url"
              value={formData.url}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border-2 border-ink focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="ブログ記事や X・Bluesky のポストの URL"
            />
          </div>

          {formData.url && (
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-ink mb-1">
                タイトル
                {isLoadingTitle && (
                  <span className="ml-2 text-sm text-ink-muted">取得中...</span>
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
                className="w-full px-3 py-2 border-2 border-ink focus:outline-none focus:ring-2 focus:ring-brand"
                placeholder="URL から自動で入ります"
              />
            </div>
          )}

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
                  <p className="text-sm text-brand">{captchaError}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                ローカルテストモードのため認証はスキップされます。
              </p>
            )
          ) : (
            <p className="text-sm text-brand">
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
