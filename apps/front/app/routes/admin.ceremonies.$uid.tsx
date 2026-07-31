import {useCallback, useEffect, useState} from 'react';
import {useNavigate} from 'react-router';
import {CeremonyForm} from '@/components/admin/ceremonies/ceremony-form';
import {CeremonyHeader} from '@/components/admin/ceremonies/ceremony-header';
import {ensureToken} from '@/components/admin/ceremonies/ensure-token';
import {NominationSection} from '@/components/admin/ceremonies/nomination-section';
import type {CeremonyResponse} from '@/components/admin/ceremonies/types';
import {useAwardsData} from '@/components/admin/ceremonies/use-awards-data';
import {adminFetch} from '@/lib/admin-fetch';
import type {Route} from './+types/admin.ceremonies.$uid';
import {resolveApiUrl} from '@/lib/api';

type LoaderData = {
  apiUrl: string;
  ceremonyUid: string;
};

export function meta() {
  return [
    {title: 'セレモニー編集 | Shine Admin'},
    {
      name: 'description',
      content: 'セレモニー情報と映画の紐付けを編集します。',
    },
  ];
}

export async function loader({context, params}: Route.LoaderArgs) {
  const ceremonyUid = params.uid;
  if (!ceremonyUid) {
    throw new Response('Not Found', {status: 404});
  }

  return {
    apiUrl: resolveApiUrl(context),
    ceremonyUid,
  };
}

export default function AdminCeremonyEdit({loaderData}: Route.ComponentProps) {
  const {apiUrl, ceremonyUid} = loaderData as LoaderData;
  const navigate = useNavigate();
  const isNew = ceremonyUid === 'new';

  const {awardsData, awardsLoading, awardsError} = useAwardsData(apiUrl);

  const [ceremonyDetail, setCeremonyDetail] = useState<
    CeremonyResponse | undefined
  >();
  const [detailLoading, setDetailLoading] = useState(!isNew);
  const [detailError, setDetailError] = useState<string | undefined>();
  const [formOrganizationUid, setFormOrganizationUid] = useState('');

  const fetchCeremony = useCallback(
    async (options?: {showSpinner?: boolean}) => {
      const {showSpinner = true} = options ?? {};

      if (showSpinner) {
        setDetailLoading(true);
      }
      setDetailError(undefined);

      try {
        const response = await adminFetch(
          `${apiUrl}/admin/ceremonies/${ceremonyUid}`,
        );

        if (response.status === 401) {
          return;
        }

        if (response.status === 404) {
          setDetailError('セレモニーが見つかりませんでした。');
          setCeremonyDetail(undefined);
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed with status ${response.status}`);
        }

        const data = (await response.json()) as CeremonyResponse;
        setCeremonyDetail(data);
      } catch (error) {
        console.error('Failed to load ceremony detail:', error);
        setDetailError('セレモニー情報の取得に失敗しました。');
        setCeremonyDetail(undefined);
      } finally {
        if (showSpinner) {
          setDetailLoading(false);
        }
      }
    },
    [apiUrl, ceremonyUid],
  );

  useEffect(() => {
    if (isNew) {
      setDetailLoading(false);
      setCeremonyDetail(undefined);
      return;
    }

    if (!ensureToken()) {
      return;
    }

    void fetchCeremony({showSpinner: true});
  }, [fetchCeremony, isNew]);

  const handleSaved = useCallback(
    (saved: CeremonyResponse) => {
      setCeremonyDetail(saved);

      if (isNew) {
        navigate(`/admin/ceremonies/${saved.ceremony.uid}`, {replace: true});
      }
    },
    [isNew, navigate],
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <CeremonyHeader
        apiUrl={apiUrl}
        isNew={isNew}
        ceremonyDetail={ceremonyDetail}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <CeremonyForm
          apiUrl={apiUrl}
          ceremonyUid={ceremonyUid}
          isNew={isNew}
          ceremonyDetail={ceremonyDetail}
          awardsLoading={awardsLoading}
          awardsError={awardsError}
          organizations={awardsData?.organizations ?? []}
          onSaved={handleSaved}
          onOrganizationUidChange={setFormOrganizationUid}
        />

        <NominationSection
          apiUrl={apiUrl}
          isNew={isNew}
          ceremonyDetail={ceremonyDetail}
          detailLoading={detailLoading}
          detailError={detailError}
          awardsData={awardsData}
          formOrganizationUid={formOrganizationUid}
          refetchCeremony={fetchCeremony}
        />
      </main>
    </div>
  );
}
