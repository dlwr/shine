import {useState} from 'react';
import {useNavigate} from 'react-router';
import AdminNav from '@/components/admin-nav';
import {Button} from '@/components/ui/button';
import {adminFetch} from '@/lib/admin-fetch';
import {ensureToken} from './ensure-token';
import {formatNavigationLabel, formatTimestamp} from './format';
import type {CeremonyResponse} from './types';

type CeremonyHeaderProperties = {
  apiUrl: string;
  isNew: boolean;
  ceremonyDetail: CeremonyResponse | undefined;
};

export function CeremonyHeader({
  apiUrl,
  isNew,
  ceremonyDetail,
}: CeremonyHeaderProperties) {
  const navigate = useNavigate();
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);

  const navigation = ceremonyDetail?.navigation;

  const handleDeleteCeremony = async () => {
    if (!ceremonyDetail) {
      return;
    }

    if (typeof globalThis !== 'undefined') {
      const confirmed = globalThis.confirm?.(
        'このセレモニーを削除しますか？関連するノミネートも削除されます。',
      );
      if (!confirmed) {
        return;
      }
    }

    if (!ensureToken()) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(undefined);

    try {
      const response = await adminFetch(
        `${apiUrl}/admin/ceremonies/${ceremonyDetail.ceremony.uid}`,
        {
          method: 'DELETE',
        },
      );

      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        const data = (await response
          .json()
          .catch(() => ({error: 'Unknown error'}))) as {error?: string};
        throw new Error(data.error || 'セレモニーの削除に失敗しました。');
      }

      navigate('/admin/ceremonies');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'セレモニーの削除に失敗しました。';
      setDeleteError(message);
      console.error('Delete ceremony error:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <header className="bg-white shadow">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              セレモニー{isNew ? 'の新規作成' : '編集'}
            </h1>
            {ceremonyDetail && (
              <p className="mt-1 text-sm text-gray-500">
                最終更新: {formatTimestamp(ceremonyDetail.ceremony.updatedAt)}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <AdminNav />
            {!isNew && navigation && (
              <div className="flex justify-end gap-2">
                {navigation.previous ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="text-gray-700">
                    <a href={`/admin/ceremonies/${navigation.previous.uid}`}>
                      ← {formatNavigationLabel(navigation.previous)}
                    </a>
                  </Button>
                ) : (
                  <span className="rounded border border-gray-200 px-3 py-1 text-sm font-medium text-gray-300">
                    ← 前へ
                  </span>
                )}
                {navigation.next ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="text-gray-700">
                    <a href={`/admin/ceremonies/${navigation.next.uid}`}>
                      {formatNavigationLabel(navigation.next)} →
                    </a>
                  </Button>
                ) : (
                  <span className="rounded border border-gray-200 px-3 py-1 text-sm font-medium text-gray-300">
                    次へ →
                  </span>
                )}
              </div>
            )}
            {!isNew && ceremonyDetail?.ceremony.imdbEventUrl && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border-blue-600 text-blue-600 hover:bg-blue-50">
                <a
                  href={ceremonyDetail.ceremony.imdbEventUrl}
                  target="_blank"
                  rel="noreferrer">
                  IMDbで表示
                </a>
              </Button>
            )}
            {!isNew && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDeleteCeremony}
                disabled={isDeleting}
                className="px-4">
                {isDeleting ? '削除中…' : 'セレモニーを削除'}
              </Button>
            )}
          </div>
        </div>
        {deleteError && (
          <p className="mt-2 text-sm text-red-600">{deleteError}</p>
        )}
      </div>
    </header>
  );
}
