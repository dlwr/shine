import {useCallback, useEffect, useReducer} from 'react';
import type {FormEvent} from 'react';
import type {MovieDetails} from '../../../routes/admin.movies.$id';
import {adminFetch, readErrorMessage} from '@/lib/admin-fetch';
import {ensureToken} from '../ceremonies/ensure-token';
import type {Nomination} from './types';

export type NewNominationValues = {
  organizationUid: string;
  ceremonyUid: string;
  categoryUid: string;
  isWinner: boolean;
  specialMention: string;
};

export type EditValues = {
  isWinner: boolean;
  specialMention: string;
};

export type NominationEditorState = {
  showAddForm: boolean;
  newNomination: NewNominationValues;
  isAdding: boolean;
  editingNominationId: string | undefined;
  editValues: EditValues;
  isUpdating: boolean;
  deletingNominationId: string | undefined;
  error: string | undefined;
};

export type NominationEditorAction =
  | {type: 'toggleAddForm'}
  | {type: 'closeAddForm'}
  | {type: 'changeOrganization'; organizationUid: string}
  | {type: 'changeNewNomination'; values: Partial<NewNominationValues>}
  | {type: 'addStarted'}
  | {type: 'addFinished'}
  | {type: 'startEdit'; nomination: Nomination}
  | {type: 'changeEditValues'; values: Partial<EditValues>}
  | {type: 'cancelEdit'}
  | {type: 'stopEditing'}
  | {type: 'updateStarted'}
  | {type: 'updateFinished'}
  | {type: 'deleteStarted'; nominationId: string}
  | {type: 'deleteFinished'}
  | {type: 'failed'; message: string}
  | {type: 'clearError'};

const initialNewNomination: NewNominationValues = {
  organizationUid: '',
  ceremonyUid: '',
  categoryUid: '',
  isWinner: false,
  specialMention: '',
};

const initialEditValues: EditValues = {
  isWinner: false,
  specialMention: '',
};

export const initialNominationEditorState: NominationEditorState = {
  showAddForm: false,
  newNomination: initialNewNomination,
  isAdding: false,
  editingNominationId: undefined,
  editValues: initialEditValues,
  isUpdating: false,
  deletingNominationId: undefined,
  error: undefined,
};

const closeAddForm = (state: NominationEditorState): NominationEditorState => ({
  ...state,
  showAddForm: false,
  newNomination: initialNewNomination,
  error: undefined,
});

export function nominationEditorReducer(
  state: NominationEditorState,
  action: NominationEditorAction,
): NominationEditorState {
  switch (action.type) {
    case 'toggleAddForm': {
      return state.showAddForm
        ? closeAddForm(state)
        : {...state, showAddForm: true};
    }

    case 'closeAddForm': {
      return closeAddForm(state);
    }

    case 'changeOrganization': {
      return {
        ...state,
        newNomination: {
          ...state.newNomination,
          organizationUid: action.organizationUid,
          ceremonyUid: '',
          categoryUid: '',
        },
      };
    }

    case 'changeNewNomination': {
      return {
        ...state,
        newNomination: {...state.newNomination, ...action.values},
      };
    }

    case 'addStarted': {
      return {...state, isAdding: true};
    }

    case 'addFinished': {
      return {...state, isAdding: false};
    }

    case 'startEdit': {
      return {
        ...state,
        editingNominationId: action.nomination.uid,
        editValues: {
          isWinner: action.nomination.isWinner,
          specialMention: action.nomination.specialMention ?? '',
        },
        error: undefined,
      };
    }

    case 'changeEditValues': {
      return {...state, editValues: {...state.editValues, ...action.values}};
    }

    case 'cancelEdit': {
      return {
        ...state,
        editingNominationId: undefined,
        editValues: initialEditValues,
      };
    }

    case 'stopEditing': {
      return {...state, editingNominationId: undefined};
    }

    case 'updateStarted': {
      return {...state, isUpdating: true, error: undefined};
    }

    case 'updateFinished': {
      return {...state, isUpdating: false};
    }

    case 'deleteStarted': {
      return {
        ...state,
        deletingNominationId: action.nominationId,
        error: undefined,
      };
    }

    case 'deleteFinished': {
      return {...state, deletingNominationId: undefined};
    }

    case 'failed': {
      return {...state, error: action.message};
    }

    case 'clearError': {
      return {...state, error: undefined};
    }
  }
}

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
