import type {MovieDetails} from '@/components/admin/movie-info/types';
import {AddTranslationForm} from './admin/translations/add-translation-form';
import {TranslationList} from './admin/translations/translation-list';
import type {Translation} from './admin/translations/types';
import {useTranslationEditor} from './admin/translations/use-translation-editor';

type TranslationManagerProperties = {
  movieId: string;
  apiUrl: string;
  translations: Translation[];
  onTranslationsUpdate: (movieData: MovieDetails) => void;
};

export default function TranslationManager({
  movieId,
  apiUrl,
  translations,
  onTranslationsUpdate,
}: TranslationManagerProperties) {
  const editor = useTranslationEditor({apiUrl, movieId, onTranslationsUpdate});

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">翻訳</h3>
        <button
          type="button"
          onClick={editor.toggleAddForm}
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
          {editor.showAddForm ? 'キャンセル' : '翻訳を追加'}
        </button>
      </div>

      {editor.showAddForm && (
        <AddTranslationForm
          values={editor.newTranslation}
          error={editor.error}
          onChange={editor.changeNewTranslation}
          onSubmit={editor.addTranslation}
          onCancel={editor.closeAddForm}
        />
      )}

      <TranslationList
        translations={translations}
        editingTranslationUid={editor.editingTranslationUid}
        onStartEdit={editor.startEdit}
        onCancelEdit={editor.cancelEdit}
        onSave={editor.updateTranslation}
        onDelete={editor.deleteTranslation}
      />
    </div>
  );
}
