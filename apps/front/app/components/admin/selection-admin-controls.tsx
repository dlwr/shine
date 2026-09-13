import {useCallback, useState} from 'react';
import type {Dispatch, SetStateAction} from 'react';
import {Button} from '@/components/ui/button';
import {adminFetch} from '@/lib/admin-fetch';
import {
  fetchHighlightedMovies,
  type HighlightedMovies,
  type PeriodType,
} from '@/lib/home';
import {ManualSelectionPanel} from './manual-selection-panel';

export function SelectionAdminControls({
  period,
  movieUid,
  locale,
  apiUrl,
  adminToken,
  onMoviesChange,
  onError,
}: {
  period: PeriodType;
  movieUid: string | undefined;
  locale: string;
  apiUrl: string;
  adminToken: string | undefined;
  onMoviesChange: Dispatch<SetStateAction<HighlightedMovies | undefined>>;
  onError: Dispatch<SetStateAction<string | undefined>>;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  const refreshHighlightedMovies = useCallback(async () => {
    onMoviesChange(await fetchHighlightedMovies(apiUrl, locale));
  }, [apiUrl, locale, onMoviesChange]);

  const handleReselect = useCallback(async () => {
    if (!adminToken) {
      alert(
        locale === 'ja'
          ? '管理者としてログインしてください'
          : 'Please login as admin',
      );
      return;
    }

    setIsLoading(true);

    try {
      const response = await adminFetch(`${apiUrl}/reselect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: period,
          locale,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      await refreshHighlightedMovies();
      onError(() => undefined); // eslint-disable-line unicorn/no-useless-undefined
    } catch (error_) {
      console.error('Error re-selecting movie:', error_);
      alert(
        locale === 'ja'
          ? 'エラーが発生しました。再度お試しください。'
          : 'An error occurred. Please try again.',
      );
      onError(
        locale === 'ja'
          ? '最新の映画情報を取得できませんでした。'
          : 'Failed to update selections.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [adminToken, apiUrl, locale, onError, period, refreshHighlightedMovies]);

  const handleOverrideSuccess = useCallback(async () => {
    try {
      await refreshHighlightedMovies();
      onError(() => '');
      setIsSearchVisible(false);
    } catch (error_) {
      console.error('Error refreshing movies after override:', error_);
      onError(
        locale === 'ja'
          ? '最新の映画情報を取得できませんでした。'
          : 'Failed to update selections.',
      );
    }
  }, [locale, onError, refreshHighlightedMovies]);

  const editLabel = locale === 'ja' ? '編集' : 'Edit';
  const reselectLabel = locale === 'ja' ? '再抽選' : 'Re-select';
  const manualSetLabel = locale === 'ja' ? '検索して設定' : 'Search & Set';
  const closeSearchLabel = locale === 'ja' ? '検索を閉じる' : 'Close Search';
  const processingLabel = locale === 'ja' ? '処理中...' : 'Processing...';

  return (
    <div className="flex flex-col gap-2">
      {movieUid && (
        <Button
          asChild
          variant="outline"
          size="sm"
          className="w-full border-2 border-ink font-mono text-xs">
          <a href={`/admin/movies/${movieUid}`}>{editLabel}</a>
        </Button>
      )}
      <Button
        className="w-full border-2 border-ink font-mono text-xs"
        size="sm"
        onClick={() => {
          void handleReselect();
        }}
        disabled={isLoading}>
        {isLoading ? (
          <div className="flex items-center justify-center">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink border-t-transparent mr-2" />
            {processingLabel}
          </div>
        ) : (
          reselectLabel
        )}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="w-full border-2 border-ink font-mono text-xs"
        onClick={() => {
          setIsSearchVisible(previous => !previous);
        }}
        disabled={isLoading}>
        {isSearchVisible ? closeSearchLabel : manualSetLabel}
      </Button>
      {isSearchVisible && (
        <div className="mt-2">
          <ManualSelectionPanel
            period={period}
            locale={locale}
            apiUrl={apiUrl}
            onClose={() => {
              setIsSearchVisible(false);
            }}
            onOverrideSuccess={handleOverrideSuccess}
            onOverrideLoadingChange={setIsLoading}
            isParentLoading={isLoading}
          />
        </div>
      )}
    </div>
  );
}
