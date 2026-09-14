import {useMemo, useState} from 'react';
import {adminFetch, readErrorMessage} from '@/lib/admin-fetch';
import {AddNominationForm} from './add-nomination-form';
import {ensureToken} from './ensure-token';
import {MovieSearchPanel} from './movie-search-panel';
import {NominationTable} from './nomination-table';
import type {
  AwardsCategory,
  AwardsData,
  CeremonyResponse,
  MovieSearchResult,
} from './types';

type NominationSectionProperties = {
  apiUrl: string;
  ceremonyDetail: CeremonyResponse | undefined;
  detailLoading: boolean;
  detailError: string | undefined;
  awardsData: AwardsData | undefined;
  formOrganizationUid: string;
  refetchCeremony: (options?: {showSpinner?: boolean}) => Promise<void>;
};

export function NominationSection({
  apiUrl,
  ceremonyDetail,
  detailLoading,
  detailError,
  awardsData,
  formOrganizationUid,
  refetchCeremony,
}: NominationSectionProperties) {
  const [nominationMessage, setNominationMessage] = useState<
    string | undefined
  >();
  const [selectedMovie, setSelectedMovie] = useState<MovieSearchResult>();
  const [searchResetKey, setSearchResetKey] = useState(0);

  const categoriesForOrganization = useMemo(() => {
    if (awardsData === undefined) {
      return [];
    }

    const filtered: AwardsCategory[] = awardsData.categories.filter(
      category => category.organizationUid === formOrganizationUid,
    );

    // eslint-disable-next-line unicorn/no-array-sort
    return filtered.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [awardsData, formOrganizationUid]);

  const handleRemoveNomination = async (nominationUid: string) => {
    if (typeof globalThis !== 'undefined') {
      const confirmed =
        globalThis.confirm?.('この映画との紐付けを削除しますか？');
      if (!confirmed) {
        return;
      }
    }

    if (!ensureToken()) {
      return;
    }

    try {
      const response = await adminFetch(
        `${apiUrl}/admin/nominations/${nominationUid}`,
        {
          method: 'DELETE',
        },
      );

      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, '紐付けの削除に失敗しました。'),
        );
      }

      await refetchCeremony({showSpinner: false});
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '紐付けの削除に失敗しました。';
      setNominationMessage(message);
      console.error('Remove nomination error:', error);
    }
  };

  const handleNominationAdded = async () => {
    await refetchCeremony({showSpinner: true});
    setSelectedMovie(undefined);
    setSearchResetKey(previous => previous + 1);
  };

  return (
    <section className="mt-8 rounded-lg bg-white p-6 shadow">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            紐付いている映画
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            ノミネート・受賞作品を追加・削除できます。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {ceremonyDetail && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
              {ceremonyDetail.nominations.length} 件
            </span>
          )}
        </div>
      </div>

      {detailLoading ? (
        <div className="mt-6 rounded bg-gray-50 px-4 py-3 text-sm text-gray-500">
          ノミネート情報を読み込み中です…
        </div>
      ) : detailError ? (
        <div className="mt-6 rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {detailError}
        </div>
      ) : ceremonyDetail ? (
        <div className="mt-6 space-y-6">
          <NominationTable
            nominations={ceremonyDetail.nominations}
            onRemove={nominationUid => {
              void handleRemoveNomination(nominationUid);
            }}
          />

          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="text-md font-semibold text-gray-900">映画を追加</h3>
            <p className="mt-1 text-sm text-gray-500">
              映画を検索し、部門を選択して追加します。
            </p>

            <div className="mt-4 space-y-6">
              <MovieSearchPanel
                key={searchResetKey}
                apiUrl={apiUrl}
                selectedMovie={selectedMovie}
                onSelectMovie={movie => setSelectedMovie(movie)}
              />

              <AddNominationForm
                apiUrl={apiUrl}
                ceremonyDetail={ceremonyDetail}
                selectedMovie={selectedMovie}
                categories={categoriesForOrganization}
                message={nominationMessage}
                onMessage={message => setNominationMessage(message)}
                onAdded={handleNominationAdded}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
          まずセレモニー情報を保存してください。
        </div>
      )}
    </section>
  );
}
