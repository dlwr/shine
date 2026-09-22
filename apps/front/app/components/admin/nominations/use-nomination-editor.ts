import {useCallback, useEffect, useReducer} from 'react';
import type {FormEvent} from 'react';
import type {MovieDetails} from '../movie-info/types';
import {adminFetch, readErrorMessage} from '@/lib/admin-fetch';
import {ensureToken} from '../ceremonies/ensure-token';
import {
  initialNominationEditorState,
  nominationEditorReducer,
  type EditValues,
  type NewNominationValues,
  type NominationEditorAction,
} from './nomination-editor-state';
import {
  createNominationRequest,
  deleteNominationRequest,
  isNewNominationComplete,
  updateNominationRequest,
} from './nomination-requests';
import type {Nomination} from './types';

type Mutation = {
  request: {url: string; init: RequestInit};
  started: NominationEditorAction;
  finished: NominationEditorAction;
  succeeded?: NominationEditorAction;
  successMessage: string;
  failureMessage: string;
  logLabel: string;
};

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

    if (!response.ok) {
      return;
    }

    const movie = (await response.json()) as MovieDetails;
    onNominationsUpdate(movie);
  }, [apiUrl, movieId, onNominationsUpdate]);

  const mutate = useCallback(
    async (mutation: Mutation) => {
      if (!ensureToken()) {
        return;
      }

      dispatch(mutation.started);

      try {
        const response = await adminFetch(
          mutation.request.url,
          mutation.request.init,
        );

        if (response.status === 401) {
          return;
        }

        if (!response.ok) {
          throw new Error(
            await readErrorMessage(response, mutation.failureMessage),
          );
        }

        await refreshMovieData();
        if (mutation.succeeded) {
          dispatch(mutation.succeeded);
        }

        globalThis.alert?.(mutation.successMessage);
      } catch (error) {
        dispatch({
          type: 'failed',
          message: errorMessage(error, mutation.failureMessage),
        });
        console.error(mutation.logLabel, error);
      } finally {
        dispatch(mutation.finished);
      }
    },
    [refreshMovieData],
  );

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

      if (!isNewNominationComplete(newNomination)) {
        dispatch({
          type: 'failed',
          message: '組織・授賞式・部門をすべて選択してください',
        });
        return;
      }

      await mutate({
        request: createNominationRequest(apiUrl, movieId, newNomination),
        started: {type: 'addStarted'},
        finished: {type: 'addFinished'},
        succeeded: {type: 'closeAddForm'},
        successMessage: 'ノミネートを追加しました',
        failureMessage: 'ノミネートの追加に失敗しました',
        logLabel: 'Add nomination error:',
      });
    },
    [apiUrl, movieId, newNomination, mutate],
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

      await mutate({
        request: updateNominationRequest(
          apiUrl,
          editingNominationId,
          editValues,
        ),
        started: {type: 'updateStarted'},
        finished: {type: 'updateFinished'},
        succeeded: {type: 'stopEditing'},
        successMessage: 'ノミネートを更新しました',
        failureMessage: 'ノミネートの更新に失敗しました',
        logLabel: 'Update nomination error:',
      });
    },
    [apiUrl, editingNominationId, editValues, mutate],
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

      await mutate({
        request: deleteNominationRequest(apiUrl, nomination.uid),
        started: {type: 'deleteStarted', nominationId: nomination.uid},
        finished: {type: 'deleteFinished'},
        successMessage: 'ノミネートを削除しました',
        failureMessage: 'ノミネートの削除に失敗しました',
        logLabel: 'Delete nomination error:',
      });
    },
    [apiUrl, mutate],
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
