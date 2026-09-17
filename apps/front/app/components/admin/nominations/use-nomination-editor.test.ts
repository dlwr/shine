import {act, renderHook, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {FormEvent} from 'react';
import type {Nomination} from './types';
import {initialNominationEditorState} from './nomination-editor-state';
import {useNominationEditor} from './use-nomination-editor';

const sampleNomination: Nomination = {
  uid: 'nomination-1',
  isWinner: true,
  specialMention: '特別賞',
  category: {uid: 'category-1', name: '最優秀作品賞'},
  ceremony: {uid: 'ceremony-1', number: 47, year: 2024},
  organization: {uid: 'org-1', name: '日本アカデミー賞', shortName: 'JAA'},
};

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

vi.stubGlobal('localStorage', mockLocalStorage);

const submitEvent = () =>
  ({preventDefault: vi.fn()}) as unknown as FormEvent<HTMLFormElement>;

const movieResponse = {uid: 'movie-123', nominations: [sampleNomination]};

const okResponse = (body: unknown = {}) =>
  ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  }) as Response;

const renderEditor = (
  onNominationsUpdate = vi.fn(),
  nominations: Nomination[] = [sampleNomination],
) =>
  renderHook(
    ({nominations: current}) =>
      useNominationEditor({
        apiUrl: 'http://localhost:8787',
        movieId: 'movie-123',
        nominations: current,
        onNominationsUpdate,
      }),
    {initialProps: {nominations}},
  );

describe('useNominationEditor', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLocalStorage.getItem.mockReturnValue('admin-token');
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn());
  });

  it('組織・授賞式・部門が未選択なら送信せずエラーを出す', async () => {
    const {result} = renderEditor();

    await act(async () => {
      await result.current.handleAddNomination(submitEvent());
    });

    expect(result.current.error).toBe(
      '組織・授賞式・部門をすべて選択してください',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('追加はノミネート API に POST して映画を取り直し、フォームを閉じる', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse(movieResponse));
    const onNominationsUpdate = vi.fn();
    const {result} = renderEditor(onNominationsUpdate);

    act(() => {
      result.current.toggleAddForm();
      result.current.changeOrganization('org-1');
      result.current.changeNewNomination({
        ceremonyUid: 'ceremony-1',
        categoryUid: 'category-1',
        isWinner: true,
        specialMention: ' 特別賞 ',
      });
    });

    await act(async () => {
      await result.current.handleAddNomination(submitEvent());
    });

    const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(input).toBe(
      'http://localhost:8787/admin/movies/movie-123/nominations',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      ceremonyUid: 'ceremony-1',
      categoryUid: 'category-1',
      isWinner: true,
      specialMention: '特別賞',
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'http://localhost:8787/admin/movies/movie-123',
    );
    expect(onNominationsUpdate).toHaveBeenCalledWith(movieResponse);
    expect(result.current.showAddForm).toBe(false);
    expect(result.current.newNomination).toEqual(
      initialNominationEditorState.newNomination,
    );
    expect(alert).toHaveBeenCalledWith('ノミネートを追加しました');
  });

  it('追加に失敗したら API のエラーメッセージを出しフォームは開いたまま', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({error: '既に登録されています'}),
    } as Response);
    const {result} = renderEditor();

    act(() => {
      result.current.toggleAddForm();
      result.current.changeOrganization('org-1');
      result.current.changeNewNomination({
        ceremonyUid: 'ceremony-1',
        categoryUid: 'category-1',
      });
    });

    await act(async () => {
      await result.current.handleAddNomination(submitEvent());
    });

    expect(result.current.error).toBe('既に登録されています');
    expect(result.current.showAddForm).toBe(true);
    expect(result.current.isAdding).toBe(false);
  });

  it('更新はノミネート API に PUT して編集を終える', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse(movieResponse));
    const {result} = renderEditor();

    act(() => {
      result.current.handleStartEdit(sampleNomination);
      result.current.changeEditValues({isWinner: false, specialMention: ''});
    });

    await act(async () => {
      await result.current.handleUpdateNomination(submitEvent());
    });

    const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(input).toBe('http://localhost:8787/admin/nominations/nomination-1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({isWinner: false});
    expect(result.current.editingNominationId).toBeUndefined();
    expect(alert).toHaveBeenCalledWith('ノミネートを更新しました');
  });

  it('削除は確認して DELETE し、確認を断ったら何もしない', async () => {
    vi.mocked(confirm).mockReturnValue(false);
    const {result} = renderEditor();

    await act(async () => {
      await result.current.handleDeleteNomination(sampleNomination);
    });

    expect(confirm).toHaveBeenCalledWith(
      '「日本アカデミー賞 最優秀作品賞」のノミネートを削除しますか？',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('削除を確認したらノミネート API に DELETE する', async () => {
    vi.mocked(confirm).mockReturnValue(true);
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse(movieResponse));
    const {result} = renderEditor();

    await act(async () => {
      await result.current.handleDeleteNomination(sampleNomination);
    });

    const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(input).toBe('http://localhost:8787/admin/nominations/nomination-1');
    expect(init.method).toBe('DELETE');
    expect(result.current.deletingNominationId).toBeUndefined();
    expect(alert).toHaveBeenCalledWith('ノミネートを削除しました');
  });

  it('編集中のノミネートが一覧から消えたら編集を終える', async () => {
    const {result, rerender} = renderEditor();

    act(() => {
      result.current.handleStartEdit(sampleNomination);
    });
    expect(result.current.editingNominationId).toBe('nomination-1');

    rerender({nominations: []});

    await waitFor(() =>
      expect(result.current.editingNominationId).toBeUndefined(),
    );
  });
});
