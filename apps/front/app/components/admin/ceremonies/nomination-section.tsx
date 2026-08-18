import {useEffect, useMemo, useState} from 'react';
import {Button} from '@/components/ui/button';
import {
  adminFetch,
  readErrorMessage,
  readJsonOrDefault,
} from '@/lib/admin-fetch';
import {AddNominationForm} from './add-nomination-form';
import {findBestFilmCategory} from './best-film-category';
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
  isNew: boolean;
  ceremonyDetail: CeremonyResponse | undefined;
  detailLoading: boolean;
  detailError: string | undefined;
  awardsData: AwardsData | undefined;
  formOrganizationUid: string;
  refetchCeremony: (options?: {showSpinner?: boolean}) => Promise<void>;
};

export function NominationSection({
  apiUrl,
  isNew,
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
  const [isSyncingFromImdb, setIsSyncingFromImdb] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<MovieSearchResult>();
  const [searchResetKey, setSearchResetKey] = useState(0);
  const [syncCategoryUid, setSyncCategoryUid] = useState('');

  const organizationUid =
    ceremonyDetail?.ceremony.organizationUid || formOrganizationUid;

  const bestFilmCategory = useMemo(() => {
    if (!awardsData) {
      return;
    }

    return findBestFilmCategory(awardsData.categories, organizationUid);
  }, [awardsData, organizationUid]);

  const organizationCategories = useMemo(() => {
    if (!awardsData || !organizationUid) {
      return [];
    }

    return awardsData.categories.filter(
      category => category.organizationUid === organizationUid,
    );
  }, [awardsData, organizationUid]);

  const defaultSyncCategory = useMemo(() => {
    if (bestFilmCategory) {
      return bestFilmCategory;
    }

    if (organizationCategories.length === 1) {
      return organizationCategories[0];
    }

    return;
  }, [bestFilmCategory, organizationCategories]);

  useEffect(() => {
    if (defaultSyncCategory) {
      setSyncCategoryUid(previous =>
        previous === defaultSyncCategory.uid
          ? previous
          : defaultSyncCategory.uid,
      );
      return;
    }

    if (organizationCategories.length > 0) {
      setSyncCategoryUid(previous => {
        if (
          previous &&
          organizationCategories.some(category => category.uid === previous)
        ) {
          return previous;
        }
        return organizationCategories[0].uid;
      });
      return;
    }

    setSyncCategoryUid('');
  }, [defaultSyncCategory, organizationCategories]);

  const selectedSyncCategory = useMemo(
    () =>
      organizationCategories.find(category => category.uid === syncCategoryUid),
    [organizationCategories, syncCategoryUid],
  );

  const canSyncFromImdb =
    !isNew &&
    Boolean(ceremonyDetail?.ceremony.imdbEventUrl) &&
    Boolean(selectedSyncCategory);

  const syncButtonTooltip = (() => {
    if (!ceremonyDetail?.ceremony.imdbEventUrl) {
      return 'IMDbイベントURLを設定してください。';
    }

    if (!selectedSyncCategory) {
      return '同期対象のカテゴリを特定できませんでした。';
    }

    return;
  })();

  const isSyncButtonDisabled = isSyncingFromImdb || !canSyncFromImdb;

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

  const handleSyncFromImdb = async () => {
    if (!ceremonyDetail) {
      setNominationMessage('まずセレモニー情報を読み込んでください。');
      return;
    }

    if (!ceremonyDetail.ceremony.imdbEventUrl) {
      setNominationMessage('IMDbイベントURLを設定してください。');
      return;
    }

    if (!selectedSyncCategory) {
      setNominationMessage('同期対象のカテゴリを選択してください。');
      return;
    }

    if (!ensureToken()) {
      return;
    }

    setIsSyncingFromImdb(true);
    setNominationMessage(undefined);

    try {
      const response = await adminFetch(
        `${apiUrl}/admin/ceremonies/${ceremonyDetail.ceremony.uid}/sync-imdb`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({categoryUid: selectedSyncCategory.uid}),
        },
      );

      if (response.status === 401) {
        return;
      }

      const data = (await readJsonOrDefault(response, {
        success: false,
        error: 'Unknown error',
      })) as {
        success?: boolean;
        error?: string;
        stats?: {
          moviesCreated?: number;
          nominationsInserted?: number;
          skipped?: number;
          imdbEntries?: number;
          categoryName?: string;
        };
      };

      if (!response.ok || data.success !== true) {
        throw new Error(data.error || 'IMDbリストとの同期に失敗しました。');
      }

      await refetchCeremony({showSpinner: true});

      if (data.stats) {
        const {
          moviesCreated = 0,
          nominationsInserted = 0,
          skipped = 0,
          imdbEntries = 0,
          categoryName,
        } = data.stats;

        const detailParts = [
          `取得 ${imdbEntries} 件`,
          `登録 ${nominationsInserted} 件`,
        ];

        if (moviesCreated > 0) {
          detailParts.push(`新規映画 ${moviesCreated} 件`);
        }

        if (skipped > 0) {
          detailParts.push(`スキップ ${skipped} 件`);
        }

        setNominationMessage(
          `IMDb${
            categoryName
              ? `（${categoryName}）`
              : `（${selectedSyncCategory.name}）`
          }のリストと同期しました（${detailParts.join(' / ')}）。`,
        );
      } else {
        setNominationMessage('IMDbのリストと同期しました。');
      }
    } catch (error) {
      console.error('Sync nominations from IMDb error:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'IMDbリストとの同期に失敗しました。';
      setNominationMessage(message);
    } finally {
      setIsSyncingFromImdb(false);
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
          {!isNew && (
            <Button
              type="button"
              onClick={handleSyncFromImdb}
              disabled={isSyncButtonDisabled}
              title={syncButtonTooltip}
              className="bg-indigo-600 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">
              {isSyncingFromImdb ? '同期中…' : 'IMDbリストと同期'}
            </Button>
          )}
          {!isNew && organizationCategories.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <span>対象部門</span>
              <select
                value={syncCategoryUid}
                onChange={event => setSyncCategoryUid(event.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                {organizationCategories.map(category => (
                  <option key={category.uid} value={category.uid}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
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
