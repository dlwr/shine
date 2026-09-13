import {useMemo} from 'react';
import type {FormEvent} from 'react';
import {
  formatCeremonyLabel,
  formatOrganizationLabel,
  sortCategoriesByName,
  sortCeremoniesByYearDesc,
} from './format';
import type {AwardsCategory, AwardsCeremony, AwardsData} from './types';
import type {NewNominationValues} from './use-nomination-editor';

type AddNominationFormProperties = {
  awardsData: AwardsData | undefined;
  loadingAwards: boolean;
  values: NewNominationValues;
  isAdding: boolean;
  onOrganizationChange: (organizationUid: string) => void;
  onChange: (values: Partial<NewNominationValues>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
};

export function AddNominationForm({
  awardsData,
  loadingAwards,
  values,
  isAdding,
  onOrganizationChange,
  onChange,
  onSubmit,
  onCancel,
}: AddNominationFormProperties) {
  const filteredCeremonies = useMemo<AwardsCeremony[]>(() => {
    if (!awardsData || !values.organizationUid) {
      return [];
    }

    const ceremoniesForOrganization = awardsData.ceremonies.filter(
      ceremony => ceremony.organizationUid === values.organizationUid,
    );
    return sortCeremoniesByYearDesc(ceremoniesForOrganization);
  }, [awardsData, values.organizationUid]);

  const filteredCategories = useMemo<AwardsCategory[]>(() => {
    if (!awardsData || !values.organizationUid) {
      return [];
    }

    const categoriesForOrganization = awardsData.categories.filter(
      category => category.organizationUid === values.organizationUid,
    );
    return sortCategoriesByName(categoriesForOrganization);
  }, [awardsData, values.organizationUid]);

  return (
    <form
      className="mb-6 space-y-4 bg-gray-50 p-4 rounded border border-gray-200"
      onSubmit={onSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col text-sm text-gray-700">
          授賞団体
          <select
            className="mt-1 rounded border border-gray-300 px-3 py-2"
            value={values.organizationUid}
            onChange={event => onOrganizationChange(event.target.value)}
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
            value={values.ceremonyUid}
            onChange={event => onChange({ceremonyUid: event.target.value})}
            disabled={!values.organizationUid}
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
            value={values.categoryUid}
            onChange={event => onChange({categoryUid: event.target.value})}
            disabled={!values.organizationUid}
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
            checked={values.isWinner}
            onChange={event => onChange({isWinner: event.target.checked})}
          />
          受賞（Winner）
        </label>
      </div>
      <label className="flex flex-col text-sm text-gray-700">
        特記事項
        <input
          className="mt-1 rounded border border-gray-300 px-3 py-2"
          value={values.specialMention}
          onChange={event => onChange({specialMention: event.target.value})}
          placeholder="例：特別賞、審査員賞 など"
        />
      </label>
      <div className="flex items-center justify-end space-x-3">
        <button
          type="button"
          className="text-sm text-gray-600 hover:text-gray-800"
          onClick={onCancel}
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
  );
}
