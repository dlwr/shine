import {useState} from 'react';
import type {MovieDetails} from '@/components/admin/movie-info/types';
import {
  adminFetch,
  fetchAdminMovie,
  getAdminToken,
  readErrorMessage,
} from '@/lib/admin-fetch';
import {
  deleteTranslationRequest,
  hasRequiredTranslationFields,
  saveTranslationRequest,
} from './translation-requests';
import type {TranslationValues} from './types';

const emptyTranslation: TranslationValues = {
  languageCode: '',
  content: '',
  isDefault: false,
};

const requiredFieldsMessage = '言語コードとタイトルは必須です';

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

type UseTranslationEditorOptions = {
  apiUrl: string;
  movieId: string;
  onTranslationsUpdate: (movieData: MovieDetails) => void;
};

export function useTranslationEditor({
  apiUrl,
  movieId,
  onTranslationsUpdate,
}: UseTranslationEditorOptions) {
  const [editingTranslationUid, setEditingTranslationUid] = useState<
    string | undefined
  >();
  const [newTranslation, setNewTranslation] =
    useState<TranslationValues>(emptyTranslation);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const send = async (
    request: {url: string; init: RequestInit},
    failureMessage: string,
  ): Promise<'sent' | 'unauthorized'> => {
    if (!getAdminToken()) {
      location.assign('/admin/login');
      return 'unauthorized';
    }

    const response = await adminFetch(request.url, request.init);

    if (response.status === 401) {
      return 'unauthorized';
    }

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, failureMessage));
    }

    const movie = await fetchAdminMovie(apiUrl, movieId);
    if (movie) {
      onTranslationsUpdate(movie);
    }

    return 'sent';
  };

  const toggleAddForm = () => {
    setShowAddForm(!showAddForm);
  };

  const closeAddForm = () => {
    setShowAddForm(false);
    setNewTranslation(emptyTranslation);
    setError(undefined);
  };

  const changeNewTranslation = (values: Partial<TranslationValues>) => {
    setNewTranslation({...newTranslation, ...values});
  };

  const addTranslation = async () => {
    if (!hasRequiredTranslationFields(newTranslation)) {
      setError(requiredFieldsMessage);
      return;
    }

    try {
      const outcome = await send(
        saveTranslationRequest(apiUrl, movieId, newTranslation),
        'Failed to add translation',
      );
      if (outcome === 'unauthorized') {
        return;
      }

      closeAddForm();
      globalThis.alert?.('翻訳を追加しました');
    } catch (error_) {
      setError(errorMessage(error_, 'Failed to add translation'));
      console.error('Add translation error:', error_);
    }
  };

  const updateTranslation = async (values: TranslationValues) => {
    if (!hasRequiredTranslationFields(values)) {
      setError(requiredFieldsMessage);
      return;
    }

    try {
      const outcome = await send(
        saveTranslationRequest(apiUrl, movieId, values),
        'Failed to update translation',
      );
      if (outcome === 'unauthorized') {
        return;
      }

      setEditingTranslationUid(undefined);
      setError(undefined);
      globalThis.alert?.('翻訳を更新しました');
    } catch (error_) {
      setError(errorMessage(error_, 'Failed to update translation'));
      console.error('Update translation error:', error_);
    }
  };

  const deleteTranslation = async (languageCode: string) => {
    if (!globalThis.confirm?.(`「${languageCode}」の翻訳を削除しますか？`)) {
      return;
    }

    try {
      const outcome = await send(
        deleteTranslationRequest(apiUrl, movieId, languageCode),
        'Failed to delete translation',
      );
      if (outcome === 'unauthorized') {
        return;
      }

      globalThis.alert?.('翻訳を削除しました');
    } catch (error_) {
      globalThis.alert?.(errorMessage(error_, 'Failed to delete translation'));
      console.error('Delete translation error:', error_);
    }
  };

  return {
    editingTranslationUid,
    newTranslation,
    showAddForm,
    error,
    toggleAddForm,
    closeAddForm,
    changeNewTranslation,
    addTranslation,
    startEdit: setEditingTranslationUid,
    cancelEdit: () => {
      setEditingTranslationUid(undefined);
    },
    updateTranslation,
    deleteTranslation,
  };
}
