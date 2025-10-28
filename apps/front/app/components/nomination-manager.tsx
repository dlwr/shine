import {useEffect, useMemo, useState} from 'react';
import type {ChangeEvent, FormEvent} from 'react';
import type {MovieDetails, Nomination} from '../routes/admin.movies.$id';

type NominationManagerProperties = {
  movieId: string;
  apiUrl: string;
  nominations: Nomination[];
  onNominationsUpdate: (movieData: MovieDetails) => void;
};

type AwardsOrganization = {
  uid: string;
  name: string;
  country: string | null;
  shortName?: string | null;
};

type AwardsCeremony = {
  uid: string;
  organizationUid: string;
  year: number;
  ceremonyNumber: number | null;
  organizationName: string;
};

type AwardsCategory = {
  uid: string;
  organizationUid: string;
  name: string;
  organizationName: string;
};

type AwardsData = {
  organizations: AwardsOrganization[];
  ceremonies: AwardsCeremony[];
  categories: AwardsCategory[];
};

const ensureToken = () => {
  const token = globalThis.localStorage?.getItem('adminToken');
  if (!token) {
    globalThis.location.href = '/admin/login';
    return;
  }
  return token;
};

const sortCeremoniesByYearDesc = (ceremonies: AwardsCeremony[]) => {
  const sorted: AwardsCeremony[] = [];
  for (const ceremony of ceremonies) {
    const insertIndex = sorted.findIndex(
      current => current.year < ceremony.year,
    );
    if (insertIndex === -1) {
      sorted.push(ceremony);
    } else {
      sorted.splice(insertIndex, 0, ceremony);
    }
  }
  return sorted;
};

const sortCategoriesByName = (categories: AwardsCategory[]) => {
  const sorted: AwardsCategory[] = [];
  for (const category of categories) {
    const insertIndex = sorted.findIndex(
      current => current.name.localeCompare(category.name, 'ja') > 0,
    );
    if (insertIndex === -1) {
      sorted.push(category);
    } else {
      sorted.splice(insertIndex, 0, category);
    }
  }
  return sorted;
};

const formatOrganizationLabel = (organization: AwardsOrganization) => {
  const segments = [organization.name];
  if (organization.shortName && organization.shortName.trim() !== '') {
    segments.push(`(${organization.shortName})`);
  }
  if (organization.country && organization.country.trim() !== '') {
    segments.push(`- ${organization.country}`);
  }
  return segments.join(' ');
};

const formatCeremonyLabel = (ceremony: AwardsCeremony) => {
  const parts = [`${ceremony.year}年`];
  if (ceremony.ceremonyNumber) {
    parts.push(`第${ceremony.ceremonyNumber}回`);
  }
  return parts.join(' / ');
};

export default function NominationManager({
  movieId,
  apiUrl,
  nominations,
  onNominationsUpdate,
}: NominationManagerProperties) {
  const [awardsData, setAwardsData] = useState<AwardsData | undefined>();
  const [loadingAwards, setLoadingAwards] = useState(true);
  const [awardsError, setAwardsError] = useState<string | undefined>();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newNomination, setNewNomination] = useState({
    organizationUid: '',
    ceremonyUid: '',
    categoryUid: '',
    isWinner: false,
    specialMention: '',
  });
  const [isAdding, setIsAdding] = useState(false);

  const [editingNominationId, setEditingNominationId] = useState<
    string | undefined
  >();
  const [editValues, setEditValues] = useState({
    isWinner: false,
    specialMention: '',
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingNominationId, setDeletingNominationId] = useState<
    string | undefined
  >();

  const [nominationError, setNominationError] = useState<string | undefined>();

  useEffect(() => {
    const loadAwards = async () => {
      if (globalThis.window === undefined) {
        return;
      }

      const token = globalThis.localStorage?.getItem('adminToken');
      if (!token) {
        globalThis.location.href = '/admin/login';
        return;
      }

      setLoadingAwards(true);
      setAwardsError(undefined);

      try {
        const response = await fetch(`${apiUrl}/admin/awards`, {
          headers: {Authorization: `Bearer ${token}`},
        });

        if (response.status === 401) {
          globalThis.localStorage?.removeItem('adminToken');
          globalThis.location.href = '/admin/login';
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch awards data');
        }

        const data = (await response.json()) as AwardsData;
        setAwardsData(data);
      } catch (error) {
        console.error('Error loading awards data:', error);
        setAwardsError('授賞データの取得に失敗しました');
      } finally {
        setLoadingAwards(false);
      }
    };

    void loadAwards();
  }, [apiUrl]);

  useEffect(() => {
    if (
      editingNominationId &&
      !nominations.some(nomination => nomination.uid === editingNominationId)
    ) {
      setEditingNominationId(undefined);
    }
  }, [nominations, editingNominationId]);

  const filteredCeremonies = useMemo<AwardsCeremony[]>(() => {
    if (!awardsData || !newNomination.organizationUid) {
      return [];
    }

    const ceremoniesForOrganization = awardsData.ceremonies.filter(
      ceremony => ceremony.organizationUid === newNomination.organizationUid,
    );
    return sortCeremoniesByYearDesc(ceremoniesForOrganization);
  }, [awardsData, newNomination.organizationUid]);

  const filteredCategories = useMemo<AwardsCategory[]>(() => {
    if (!awardsData || !newNomination.organizationUid) {
      return [];
    }

    const categoriesForOrganization = awardsData.categories.filter(
      category => category.organizationUid === newNomination.organizationUid,
    );
    return sortCategoriesByName(categoriesForOrganization);
  }, [awardsData, newNomination.organizationUid]);

  const resetAddForm = () => {
    setNewNomination({
      organizationUid: '',
      ceremonyUid: '',
      categoryUid: '',
      isWinner: false,
      specialMention: '',
    });
    setNominationError(undefined);
  };

  const refreshMovieData = async (token: string) => {
    const response = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
      headers: {Authorization: `Bearer ${token}`},
    });

    if (response.ok) {
      const movie = (await response.json()) as MovieDetails;
      onNominationsUpdate(movie);
    }
  };

  const handleOrganizationChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setNewNomination(current => ({
      organizationUid: value,
      ceremonyUid: '',
      categoryUid: '',
      isWinner: current.isWinner,
      specialMention: current.specialMention,
    }));
  };

  const handleAddNomination = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNominationError(undefined);

    if (
      !newNomination.organizationUid ||
      !newNomination.ceremonyUid ||
      !newNomination.categoryUid
    ) {
      setNominationError('組織・授賞式・部門をすべて選択してください');
      return;
    }

    const token = ensureToken();
    if (!token) {
      return;
    }

    setIsAdding(true);

    try {
      const response = await fetch(
        `${apiUrl}/admin/movies/${movieId}/nominations`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ceremonyUid: newNomination.ceremonyUid,
            categoryUid: newNomination.categoryUid,
            isWinner: newNomination.isWinner,
            specialMention:
              newNomination.specialMention.trim() === ''
                ? undefined
                : newNomination.specialMention.trim(),
          }),
        },
      );

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
        return;
      }

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({error: 'Unknown error'}))) as {error?: string};
        throw new Error(errorData.error || 'ノミネートの追加に失敗しました');
      }

      await refreshMovieData(token);
      resetAddForm();
      setShowAddForm(false);
      globalThis.alert?.('ノミネートを追加しました');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'ノミネートの追加に失敗しました';
      setNominationError(message);
      console.error('Add nomination error:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleStartEdit = (nomination: Nomination) => {
    setEditingNominationId(nomination.uid);
    setEditValues({
      isWinner: nomination.isWinner,
      specialMention: nomination.specialMention ?? '',
    });
    setNominationError(undefined);
  };

  const handleUpdateNomination = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingNominationId) {
      return;
    }

    const token = ensureToken();
    if (!token) {
      return;
    }

    setIsUpdating(true);
    setNominationError(undefined);

    try {
      const response = await fetch(
        `${apiUrl}/admin/nominations/${editingNominationId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            isWinner: editValues.isWinner,
            specialMention:
              editValues.specialMention.trim() === ''
                ? undefined
                : editValues.specialMention.trim(),
          }),
        },
      );

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
        return;
      }

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({error: 'Unknown error'}))) as {error?: string};
        throw new Error(errorData.error || 'ノミネートの更新に失敗しました');
      }

      await refreshMovieData(token);
      setEditingNominationId(undefined);
      globalThis.alert?.('ノミネートを更新しました');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'ノミネートの更新に失敗しました';
      setNominationError(message);
      console.error('Update nomination error:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteNomination = async (nomination: Nomination) => {
    if (
      !globalThis.confirm?.(
        `「${nomination.organization.name} ${nomination.category.name}」のノミネートを削除しますか？`,
      )
    ) {
      return;
    }

    const token = ensureToken();
    if (!token) {
      return;
    }

    setDeletingNominationId(nomination.uid);
    setNominationError(undefined);

    try {
      const response = await fetch(
        `${apiUrl}/admin/nominations/${nomination.uid}`,
        {
          method: 'DELETE',
          headers: {Authorization: `Bearer ${token}`},
        },
      );

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
        return;
      }

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({error: 'Unknown error'}))) as {error?: string};
        throw new Error(errorData.error || 'ノミネートの削除に失敗しました');
      }

      await refreshMovieData(token);
      globalThis.alert?.('ノミネートを削除しました');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'ノミネートの削除に失敗しました';
      setNominationError(message);
      console.error('Delete nomination error:', error);
    } finally {
      setDeletingNominationId(undefined);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">ノミネート管理</h3>
        <button
          type="button"
          onClick={() => {
            const next = !showAddForm;
            setShowAddForm(next);
            if (!next) {
              resetAddForm();
            }
          }}
          className="bg-blue-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-blue-700"
          disabled={loadingAwards}>
          {showAddForm ? 'キャンセル' : 'ノミネートを追加'}
        </button>
      </div>

      {awardsError && (
        <p className="mb-4 text-sm text-red-600">{awardsError}</p>
      )}

      {nominationError && (
        <p className="mb-4 text-sm text-red-600">{nominationError}</p>
      )}

      {showAddForm && (
        <form
          className="mb-6 space-y-4 bg-gray-50 p-4 rounded border border-gray-200"
          onSubmit={handleAddNomination}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col text-sm text-gray-700">
              授賞団体
              <select
                className="mt-1 rounded border border-gray-300 px-3 py-2"
                value={newNomination.organizationUid}
                onChange={handleOrganizationChange}
                required>
                <option value="">選択してください</option>
                {(awardsData?.organizations ?? []).map(organization => (
                  <option key={organization.uid} value={organization.uid}>
                    {formatOrganizationLabel(organization)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-sm text-gray-700">
              授賞式
              <select
                className="mt-1 rounded border border-gray-300 px-3 py-2"
                value={newNomination.ceremonyUid}
                onChange={event =>
                  setNewNomination(current => ({
                    ...current,
                    ceremonyUid: event.target.value,
                  }))
                }
                disabled={!newNomination.organizationUid}
                required>
                <option value="">選択してください</option>
                {filteredCeremonies.map(ceremony => (
                  <option key={ceremony.uid} value={ceremony.uid}>
                    {formatCeremonyLabel(ceremony)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-sm text-gray-700">
              部門
              <select
                className="mt-1 rounded border border-gray-300 px-3 py-2"
                value={newNomination.categoryUid}
                onChange={event =>
                  setNewNomination(current => ({
                    ...current,
                    categoryUid: event.target.value,
                  }))
                }
                disabled={!newNomination.organizationUid}
                required>
                <option value="">選択してください</option>
                {filteredCategories.map(category => (
                  <option key={category.uid} value={category.uid}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center mt-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mr-2 rounded border-gray-300"
                checked={newNomination.isWinner}
                onChange={event =>
                  setNewNomination(current => ({
                    ...current,
                    isWinner: event.target.checked,
                  }))
                }
              />
              受賞（Winner）
            </label>
          </div>
          <label className="flex flex-col text-sm text-gray-700">
            特記事項
            <input
              className="mt-1 rounded border border-gray-300 px-3 py-2"
              value={newNomination.specialMention}
              onChange={event =>
                setNewNomination(current => ({
                  ...current,
                  specialMention: event.target.value,
                }))
              }
              placeholder="例：特別賞、審査員賞 など"
            />
          </label>
          <div className="flex items-center justify-end space-x-3">
            <button
              type="button"
              className="text-sm text-gray-600 hover:text-gray-800"
              onClick={() => {
                setShowAddForm(false);
                resetAddForm();
              }}
              disabled={isAdding}>
              キャンセル
            </button>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              disabled={isAdding || loadingAwards}>
              {isAdding ? '追加中...' : 'ノミネートを追加'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        {nominations.length === 0 ? (
          <p className="text-gray-500 italic">ノミネートがありません</p>
        ) : (
          <table className="min-w-full table-auto">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-medium text-gray-900">
                  組織
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-900">
                  年
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-900">
                  カテゴリ
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-900">
                  結果
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-900">
                  特記事項
                </th>
                <th className="text-left py-2 px-3 font-medium text-gray-900">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {nominations.map(nomination => (
                <tr key={nomination.uid} className="border-b border-gray-100">
                  <td className="py-2 px-3">
                    <div className="text-sm">
                      <div className="font-medium">
                        {nomination.organization.name}
                      </div>
                      <div className="text-gray-500">
                        ({nomination.organization.shortName})
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="text-sm">
                      <div>{nomination.ceremony.year}</div>
                      <div className="text-gray-500">
                        第{nomination.ceremony.number}回
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-sm">
                    {nomination.category.name}
                  </td>
                  <td className="py-2 px-3">
                    {nomination.isWinner ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        受賞
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        ノミネート
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-sm text-gray-600">
                    {nomination.specialMention || '-'}
                  </td>
                  <td className="py-2 px-3 text-sm">
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        className="text-blue-600 hover:text-blue-800"
                        onClick={() => handleStartEdit(nomination)}>
                        編集
                      </button>
                      <button
                        type="button"
                        className="text-red-600 hover:text-red-800 disabled:opacity-60"
                        onClick={() => handleDeleteNomination(nomination)}
                        disabled={deletingNominationId === nomination.uid}>
                        {deletingNominationId === nomination.uid
                          ? '削除中...'
                          : '削除'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editingNominationId && (
        <form
          className="mt-6 space-y-4 bg-gray-50 p-4 rounded border border-gray-200"
          onSubmit={handleUpdateNomination}>
          <h4 className="text-md font-medium text-gray-900">
            ノミネートを編集
          </h4>
          <label className="flex items-center text-sm text-gray-700">
            <input
              type="checkbox"
              className="mr-2 rounded border-gray-300"
              checked={editValues.isWinner}
              onChange={event =>
                setEditValues(current => ({
                  ...current,
                  isWinner: event.target.checked,
                }))
              }
            />
            受賞（Winner）
          </label>
          <label className="flex flex-col text-sm text-gray-700">
            特記事項
            <input
              className="mt-1 rounded border border-gray-300 px-3 py-2"
              value={editValues.specialMention}
              onChange={event =>
                setEditValues(current => ({
                  ...current,
                  specialMention: event.target.value,
                }))
              }
              placeholder="例：特別賞、審査員賞 など"
            />
          </label>
          <div className="flex items-center justify-end space-x-3">
            <button
              type="button"
              className="text-sm text-gray-600 hover:text-gray-800"
              onClick={() => {
                setEditingNominationId(undefined);
                setEditValues({isWinner: false, specialMention: ''});
              }}
              disabled={isUpdating}>
              キャンセル
            </button>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
              disabled={isUpdating}>
              {isUpdating ? '更新中...' : '保存'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
