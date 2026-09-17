import {useCallback, useEffect, useReducer} from 'react';
import type {FormEvent} from 'react';
import type {MovieDetails} from '../../../routes/admin.movies.$id';
import {adminFetch, readErrorMessage} from '@/lib/admin-fetch';
import {ensureToken} from '../ceremonies/ensure-token';
import {
  initialNominationEditorState,
  nominationEditorReducer,
  type EditValues,
  type NewNominationValues,
} from './nomination-editor-state';
import type {Nomination} from './types';

const trimmedOrUndefined = (value: string) =>
  value.trim() === '' ? undefined : value.trim();

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

type UseNominationEditorOptions = {
  apiUrl: string;
  movieId: string;
  nominations: Nomination[];
  onNominationsUpdate: (movieData: MovieDetails) => void;
};

export function useNominationEditor({
  apiUrl,
  movieId,
  nominations,
  onNominationsUpdate,
}: UseNominationEditorOptions) {
  const [state, dispatch] = useReducer(
    nominationEditorReducer,
    initialNominationEditorState,
  );
  const {newNomination, editingNominationId, editValues} = state;

  useEffect(() => {
    if (
      editingNominationId &&
      nominations.every(nomination => nomination.uid !== editingNominationId)
    ) {
      dispatch({type: 'stopEditing'});
    }
  }, [nominations, editingNominationId]);

  const refreshMovieData = useCallback(async () => {
    const response = await adminFetch(`${apiUrl}/admin/movies/${movieId}`);

    if (response.ok) {
      const movie = (await response.json()) as MovieDetails;
      onNominationsUpdate(movie);
    }
  }, [apiUrl, movieId, onNominationsUpdate]);

  const toggleAddForm = useCallback(() => {
    dispatch({type: 'toggleAddForm'});
  }, []);

  const closeAddForm = useCallback(() => {
    dispatch({type: 'closeAddForm'});
  }, []);

  const changeOrganization = useCallback((organizationUid: string) => {
    dispatch({type: 'changeOrganization', organizationUid});
  }, []);

  const changeNewNomination = useCallback(
    (values: Partial<NewNominationValues>) => {
      dispatch({type: 'changeNewNomination', values});
    },
    [],
  );

  const handleAddNomination = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      dispatch({type: 'clearError'});

      if (
        !newNomination.organizationUid ||
        !newNomination.ceremonyUid ||
        !newNomination.categoryUid
      ) {
        dispatch({
          type: 'failed',
          message: '組織・授賞式・部門をすべて選択してください',
        });
        return;
      }

      if (!ensureToken()) {
        return;
      }

      dispatch({type: 'addStarted'});

      try {
        const response = await adminFetch(
          `${apiUrl}/admin/movies/${movieId}/nominations`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ceremonyUid: newNomination.ceremonyUid,
              categoryUid: newNomination.categoryUid,
              isWinner: newNomination.isWinner,
              specialMention: trimmedOrUndefined(newNomination.specialMention),
            }),
          },
        );

        if (response.status === 401) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            await readErrorMessage(response, 'ノミネートの追加に失敗しました'),
          );
        }

        await refreshMovieData();
        dispatch({type: 'closeAddForm'});
        globalThis.alert?.('ノミネートを追加しました');
      } catch (error) {
        dispatch({
          type: 'failed',
          message: errorMessage(error, 'ノミネートの追加に失敗しました'),
        });
        console.error('Add nomination error:', error);
      } finally {
        dispatch({type: 'addFinished'});
      }
    },
    [apiUrl, movieId, newNomination, refreshMovieData],
  );

  const handleStartEdit = useCallback((nomination: Nomination) => {
    dispatch({type: 'startEdit', nomination});
  }, []);

  const changeEditValues = useCallback((values: Partial<EditValues>) => {
    dispatch({type: 'changeEditValues', values});
  }, []);

  const cancelEdit = useCallback(() => {
    dispatch({type: 'cancelEdit'});
  }, []);

  const handleUpdateNomination = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editingNominationId) {
        return;
      }

      if (!ensureToken()) {
        return;
      }

      dispatch({type: 'updateStarted'});

      try {
        const response = await adminFetch(
          `${apiUrl}/admin/nominations/${editingNominationId}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              isWinner: editValues.isWinner,
              specialMention: trimmedOrUndefined(editValues.specialMention),
            }),
          },
        );

        if (response.status === 401) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            await readErrorMessage(response, 'ノミネートの更新に失敗しました'),
          );
        }

        await refreshMovieData();
        dispatch({type: 'stopEditing'});
        globalThis.alert?.('ノミネートを更新しました');
      } catch (error) {
        dispatch({
          type: 'failed',
          message: errorMessage(error, 'ノミネートの更新に失敗しました'),
        });
        console.error('Update nomination error:', error);
      } finally {
        dispatch({type: 'updateFinished'});
      }
    },
    [apiUrl, editingNominationId, editValues, refreshMovieData],
  );

  const handleDeleteNomination = useCallback(
    async (nomination: Nomination) => {
      if (
        !globalThis.confirm?.(
          `「${nomination.organization.name} ${nomination.category.name}」のノミネートを削除しますか？`,
        )
      ) {
        return;
      }

      if (!ensureToken()) {
        return;
      }

      dispatch({type: 'deleteStarted', nominationId: nomination.uid});

      try {
        const response = await adminFetch(
          `${apiUrl}/admin/nominations/${nomination.uid}`,
          {
            method: 'DELETE',
          },
        );

        if (response.status === 401) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            await readErrorMessage(response, 'ノミネートの削除に失敗しました'),
          );
        }

        await refreshMovieData();
        globalThis.alert?.('ノミネートを削除しました');
      } catch (error) {
        dispatch({
          type: 'failed',
          message: errorMessage(error, 'ノミネートの削除に失敗しました'),
        });
        console.error('Delete nomination error:', error);
      } finally {
        dispatch({type: 'deleteFinished'});
      }
    },
    [apiUrl, refreshMovieData],
  );

  return {
    ...state,
    toggleAddForm,
    closeAddForm,
    changeOrganization,
    changeNewNomination,
    handleAddNomination,
    handleStartEdit,
    changeEditValues,
    cancelEdit,
    handleUpdateNomination,
    handleDeleteNomination,
  };
}
