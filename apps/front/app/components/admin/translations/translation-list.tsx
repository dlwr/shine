import {EditTranslationForm} from './edit-translation-form';
import type {Translation, TranslationValues} from './types';

type TranslationListProperties = {
  translations: Translation[];
  editingTranslationUid: string | undefined;
  onStartEdit: (uid: string) => void;
  onCancelEdit: () => void;
  onSave: (values: TranslationValues) => void;
  onDelete: (languageCode: string) => void;
};

export function TranslationList({
  translations,
  editingTranslationUid,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: TranslationListProperties) {
  if (translations.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-gray-500 italic">翻訳がありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {translations.map(translation => (
        <div
          key={translation.uid}
          className="flex items-center justify-between p-3 border border-gray-200 rounded">
          {editingTranslationUid === translation.uid ? (
            <EditTranslationForm
              translation={translation}
              onSave={onSave}
              onCancel={onCancelEdit}
              onDelete={onDelete}
            />
          ) : (
            <>
              <div className="flex-1">
                <span className="font-medium text-blue-600">
                  {translation.languageCode}
                </span>
                <span className="mx-2 text-gray-400">→</span>
                <span>{translation.content}</span>
                {translation.isDefault === 1 && (
                  <span className="ml-2 bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                    デフォルト
                  </span>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    onStartEdit(translation.uid);
                  }}
                  className="text-blue-600 hover:text-blue-800 text-sm">
                  編集
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(translation.languageCode);
                  }}
                  className="text-red-600 hover:text-red-800 text-sm">
                  削除
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
