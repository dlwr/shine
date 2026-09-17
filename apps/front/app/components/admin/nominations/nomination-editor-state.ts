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
