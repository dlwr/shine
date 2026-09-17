import {describe, expect, it} from 'vitest';
import {
  initialNominationEditorState,
  nominationEditorReducer,
} from './nomination-editor-state';
import type {Nomination} from './types';

const sampleNomination: Nomination = {
  uid: 'nomination-1',
  isWinner: true,
  specialMention: '特別賞',
  category: {uid: 'category-1', name: '最優秀作品賞'},
  ceremony: {uid: 'ceremony-1', number: 47, year: 2024},
  organization: {uid: 'org-1', name: '日本アカデミー賞', shortName: 'JAA'},
};

const filledAddForm = {
  ...initialNominationEditorState,
  showAddForm: true,
  newNomination: {
    organizationUid: 'org-1',
    ceremonyUid: 'ceremony-1',
    categoryUid: 'category-1',
    isWinner: true,
    specialMention: ' 特別賞 ',
  },
};

describe('nominationEditorReducer', () => {
  it('toggleAddForm で追加フォームを開く', () => {
    const state = nominationEditorReducer(initialNominationEditorState, {
      type: 'toggleAddForm',
    });

    expect(state.showAddForm).toBe(true);
  });

  it('開いている追加フォームを toggleAddForm で閉じると入力とエラーを捨てる', () => {
    const state = nominationEditorReducer(
      {...filledAddForm, error: 'エラー'},
      {type: 'toggleAddForm'},
    );

    expect(state.showAddForm).toBe(false);
    expect(state.newNomination).toEqual(
      initialNominationEditorState.newNomination,
    );
    expect(state.error).toBeUndefined();
  });

  it('changeOrganization は授賞式と部門の選択を消す', () => {
    const state = nominationEditorReducer(filledAddForm, {
      type: 'changeOrganization',
      organizationUid: 'org-2',
    });

    expect(state.newNomination).toEqual({
      organizationUid: 'org-2',
      ceremonyUid: '',
      categoryUid: '',
      isWinner: true,
      specialMention: ' 特別賞 ',
    });
  });

  it('startEdit は対象の値を編集フォームに写す', () => {
    const state = nominationEditorReducer(initialNominationEditorState, {
      type: 'startEdit',
      nomination: sampleNomination,
    });

    expect(state.editingNominationId).toBe('nomination-1');
    expect(state.editValues).toEqual({
      isWinner: true,
      specialMention: '特別賞',
    });
  });

  it('startEdit は特記事項が無ければ空文字にする', () => {
    const state = nominationEditorReducer(initialNominationEditorState, {
      type: 'startEdit',
      nomination: {...sampleNomination, specialMention: undefined},
    });

    expect(state.editValues.specialMention).toBe('');
  });

  it('cancelEdit は編集フォームの値も戻す', () => {
    const editing = nominationEditorReducer(initialNominationEditorState, {
      type: 'startEdit',
      nomination: sampleNomination,
    });

    const state = nominationEditorReducer(editing, {type: 'cancelEdit'});

    expect(state.editingNominationId).toBeUndefined();
    expect(state.editValues).toEqual({isWinner: false, specialMention: ''});
  });

  it('stopEditing は編集フォームの値を残す', () => {
    const editing = nominationEditorReducer(initialNominationEditorState, {
      type: 'startEdit',
      nomination: sampleNomination,
    });

    const state = nominationEditorReducer(editing, {type: 'stopEditing'});

    expect(state.editingNominationId).toBeUndefined();
    expect(state.editValues).toEqual({
      isWinner: true,
      specialMention: '特別賞',
    });
  });

  it('deleteStarted は削除中の ID を持ちエラーを消す', () => {
    const state = nominationEditorReducer(
      {...initialNominationEditorState, error: 'エラー'},
      {type: 'deleteStarted', nominationId: 'nomination-1'},
    );

    expect(state.deletingNominationId).toBe('nomination-1');
    expect(state.error).toBeUndefined();
  });
});
