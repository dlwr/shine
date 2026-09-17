import {useState} from 'react';
import type {Translation, TranslationValues} from './types';

type EditTranslationFormProperties = {
  translation: Translation;
  onSave: (values: TranslationValues) => void;
  onCancel: () => void;
  onDelete: (languageCode: string) => void;
};

export function EditTranslationForm({
  translation,
  onSave,
  onCancel,
  onDelete,
}: EditTranslationFormProperties) {
  const [languageCode, setLanguageCode] = useState(translation.languageCode);
  const [content, setContent] = useState(translation.content);
  const [isDefault, setIsDefault] = useState(translation.isDefault === 1);

  return (
    <div className="flex-1 space-y-2">
      <div className="flex space-x-2">
        <input
          type="text"
          value={languageCode}
          onChange={event => {
            setLanguageCode(event.target.value);
          }}
          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
          placeholder="言語"
        />
        <input
          type="text"
          value={content}
          onChange={event => {
            setContent(event.target.value);
          }}
          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
          placeholder="タイトル"
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <input
            type="checkbox"
            id={`default-${translation.uid}`}
            checked={isDefault}
            onChange={event => {
              setIsDefault(event.target.checked);
            }}
            className="mr-1"
          />
          <label htmlFor={`default-${translation.uid}`} className="text-xs">
            デフォルト
          </label>
        </div>
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={() => {
              onSave({languageCode, content, isDefault});
            }}
            className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700">
            保存
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600">
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => {
              onDelete(translation.languageCode);
            }}
            className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700">
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
