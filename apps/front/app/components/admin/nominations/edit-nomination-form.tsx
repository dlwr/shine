import type {FormEvent} from 'react';
import type {EditValues} from './nomination-editor-state';

type EditNominationFormProperties = {
  values: EditValues;
  isUpdating: boolean;
  onChange: (values: Partial<EditValues>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
};

export function EditNominationForm({
  values,
  isUpdating,
  onChange,
  onSubmit,
  onCancel,
}: EditNominationFormProperties) {
  return (
    <form
      className="mt-6 space-y-4 bg-gray-50 p-4 rounded border border-gray-200"
      onSubmit={onSubmit}>
      <h4 className="text-md font-medium text-gray-900">ノミネートを編集</h4>
      <label className="flex items-center text-sm text-gray-700">
        <input
          type="checkbox"
          className="mr-2 rounded border-gray-300"
          checked={values.isWinner}
          onChange={event => onChange({isWinner: event.target.checked})}
        />
        受賞（Winner）
      </label>
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
  );
}
