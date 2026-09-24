import {useEffect, useState} from 'react';
import AdminNav from '@/components/admin-nav';
import {OverrideModal} from '@/components/admin/selections/override-modal';
import {SelectionCard} from '@/components/admin/selections/selection-card';
import {
  SELECTION_TYPES,
  selectionKeyMap,
  type PreviewSelections,
  type SelectionType,
} from '@/components/admin/selections/types';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type {Route} from './+types/admin.movies.selections';
import {resolveApiUrl} from '@/lib/api';
import {adminFetch, adminJson, getAdminToken} from '@/lib/admin-fetch';

export function meta(): Route.MetaDescriptors {
  return [
    {title: '映画選択管理 - SHINE Admin'},
    {name: 'description', content: 'SHINE Admin 映画選択管理画面'},
  ];
}

export async function loader({context}: Route.LoaderArgs) {
  return {
    apiUrl: resolveApiUrl(context),
  };
}

export default function AdminMovieSelections({
  loaderData,
}: Route.ComponentProps) {
  const {apiUrl} = loaderData as {apiUrl: string};
  const locale = 'ja';

  const [selections, setSelections] = useState<PreviewSelections | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [adminToken, setAdminToken] = useState<string | undefined>();
  const [overrideType, setOverrideType] = useState<SelectionType | undefined>();

  useEffect(() => {
    const loadSelections = async () => {
      if (globalThis.window === undefined) {
        return;
      }

      const token = getAdminToken();
      if (!token) {
        location.assign('/admin/login');
        return;
      }

      setAdminToken(token);
      setLoading(true);
      setError(undefined);

      try {
        const data = await adminJson<PreviewSelections>(
          `${apiUrl}/admin/preview-selections?locale=${locale}`,
          'Failed to fetch selections',
        );
        if (!data) {
          return;
        }

        setSelections(data);
      } catch (error) {
        console.error('Error loading selections:', error);
        setError('Failed to load movie selections');
      } finally {
        setLoading(false);
      }
    };

    void loadSelections();
  }, [apiUrl, locale]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <span className="text-sm text-slate-500">読み込み中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>エラーが発生しました</CardTitle>
            <CardDescription className="text-red-600">{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleOverride = async (type: SelectionType, movie: {uid: string}) => {
    const date =
      selections?.[selectionKeyMap[type]]?.date ||
      new Date().toISOString().split('T', 1)[0];

    try {
      const response = await adminFetch(`${apiUrl}/admin/override-selection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({type, date, movieId: movie.uid}),
      });

      if (response.ok) {
        location.reload();
      }
    } catch (error) {
      console.error('Override error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">映画選択管理</h1>
            <p className="text-sm text-gray-600">
              プレビュー用の「今日/今週/今月の映画」を素早く調整できます。
            </p>
          </div>
          <AdminNav />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {SELECTION_TYPES.map(type => (
            <SelectionCard
              key={type}
              type={type}
              selection={selections?.[selectionKeyMap[type]]}
              locale={locale}
              adminToken={adminToken}
              onOverride={setOverrideType}
            />
          ))}
        </div>

        {overrideType && (
          <OverrideModal
            key={overrideType}
            apiUrl={apiUrl}
            locale={locale}
            adminToken={adminToken}
            type={overrideType}
            onClose={() => setOverrideType(undefined)}
            onConfirm={movie => {
              void handleOverride(overrideType, movie);
            }}
          />
        )}
      </div>
    </div>
  );
}
