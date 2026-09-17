import type {TranslationValues} from './types';

type AddTranslationFormProperties = {
  values: TranslationValues;
  error: string | undefined;
  onChange: (values: Partial<TranslationValues>) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function AddTranslationForm({
  values,
  error,
  onChange,
  onSubmit,
  onCancel,
}: AddTranslationFormProperties) {
  return (
    <div className="mb-6 p-4 border border-gray-200 rounded bg-gray-50">
      <h4 className="font-medium mb-3">新しい翻訳を追加</h4>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            言語コード
          </label>
          <input
            type="text"
            value={values.languageCode}
            onChange={event => {
              onChange({languageCode: event.target.value});
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="例: ja, en, fr"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            タイトル
          </label>
          <input
            type="text"
            value={values.content}
            onChange={event => {
              onChange({content: event.target.value});
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="映画のタイトル"
          />
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isDefault"
            checked={values.isDefault}
            onChange={event => {
              onChange({isDefault: event.target.checked});
            }}
            className="mr-2"
          />
          <label htmlFor="isDefault" className="text-sm text-gray-700">
            デフォルトの翻訳にする
          </label>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={onSubmit}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700">
            追加
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="bg-gray-500 text-white px-4 py-2 rounded text-sm hover:bg-gray-600">
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
