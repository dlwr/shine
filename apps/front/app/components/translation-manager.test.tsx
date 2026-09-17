import '@testing-library/jest-dom';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import TranslationManager from './translation-manager';

const translations = [
  {uid: 'translation-1', languageCode: 'ja', content: '羅生門', isDefault: 1},
];

const movie = {uid: 'movie-1', translations};

const okResponse = (body: unknown = {}) =>
  ({ok: true, status: 200, json: async () => body}) as Response;

function renderManager(onTranslationsUpdate = vi.fn()) {
  render(
    <TranslationManager
      movieId="movie-1"
      apiUrl="https://api.test"
      translations={translations}
      onTranslationsUpdate={onTranslationsUpdate}
    />,
  );
  return onTranslationsUpdate;
}

function fillAddForm(languageCode: string, content: string) {
  fireEvent.click(screen.getByRole('button', {name: '翻訳を追加'}));
  fireEvent.change(screen.getByPlaceholderText('例: ja, en, fr'), {
    target: {value: languageCode},
  });
  fireEvent.change(screen.getByPlaceholderText('映画のタイトル'), {
    target: {value: content},
  });
}

describe('TranslationManager', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.setItem('adminToken', 'admin-jwt');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn());
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('言語コードかタイトルが空なら送信せずエラーを出す', () => {
    renderManager();
    fillAddForm('en', '  ');

    fireEvent.click(screen.getByRole('button', {name: '追加'}));

    expect(screen.getByText('言語コードとタイトルは必須です')).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('追加は前後の空白を落として翻訳 API に POST する', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse(movie));
    renderManager();
    fillAddForm(' en ', ' Rashomon ');

    fireEvent.click(screen.getByRole('button', {name: '追加'}));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('翻訳を追加しました'),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect([url, init.method, JSON.parse(init.body as string)]).toEqual([
      'https://api.test/movies/movie-1/translations',
      'POST',
      {languageCode: 'en', content: 'Rashomon', isDefault: false},
    ]);
  });

  it('追加したら映画を取り直して親に渡す', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse(movie));
    const onTranslationsUpdate = renderManager();
    fillAddForm('en', 'Rashomon');

    fireEvent.click(screen.getByRole('button', {name: '追加'}));

    await waitFor(() =>
      expect(onTranslationsUpdate).toHaveBeenCalledWith(movie),
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.test/admin/movies/movie-1',
    );
  });

  it('追加したらフォームを閉じる', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse(movie));
    renderManager();
    fillAddForm('en', 'Rashomon');

    fireEvent.click(screen.getByRole('button', {name: '追加'}));

    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText('例: ja, en, fr'),
      ).not.toBeInTheDocument(),
    );
  });

  it('追加に失敗したら API のエラーをフォームに出す', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({error: '言語コードが不正です'}),
    } as Response);
    renderManager();
    fillAddForm('xx', 'Rashomon');

    fireEvent.click(screen.getByRole('button', {name: '追加'}));

    expect(await screen.findByText('言語コードが不正です')).toBeVisible();
  });

  it('編集して保存すると同じ翻訳 API に POST する', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse(movie));
    renderManager();
    fireEvent.click(screen.getByRole('button', {name: '編集'}));
    fireEvent.change(screen.getByPlaceholderText('タイトル'), {
      target: {value: '羅生門 '},
    });

    fireEvent.click(screen.getByRole('button', {name: '保存'}));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('翻訳を更新しました'),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect([url, init.method, JSON.parse(init.body as string)]).toEqual([
      'https://api.test/movies/movie-1/translations',
      'POST',
      {languageCode: 'ja', content: '羅生門', isDefault: true},
    ]);
  });

  it('保存したら編集フォームを閉じる', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse(movie));
    renderManager();
    fireEvent.click(screen.getByRole('button', {name: '編集'}));

    fireEvent.click(screen.getByRole('button', {name: '保存'}));

    expect(await screen.findByRole('button', {name: '編集'})).toBeVisible();
  });

  it('削除は確認を断ったら送信しない', () => {
    vi.mocked(confirm).mockReturnValue(false);
    renderManager();

    fireEvent.click(screen.getByRole('button', {name: '削除'}));

    expect(confirm).toHaveBeenCalledWith('「ja」の翻訳を削除しますか？');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('削除を確認したら言語コードを指定して DELETE する', async () => {
    vi.mocked(confirm).mockReturnValue(true);
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse(movie));
    renderManager();

    fireEvent.click(screen.getByRole('button', {name: '削除'}));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('翻訳を削除しました'),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect([url, init.method]).toEqual([
      'https://api.test/movies/movie-1/translations/ja',
      'DELETE',
    ]);
  });

  it('削除に失敗したら API のエラーを alert で出す', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(confirm).mockReturnValue(true);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({error: '削除できません'}),
    } as Response);
    renderManager();

    fireEvent.click(screen.getByRole('button', {name: '削除'}));

    await waitFor(() => expect(alert).toHaveBeenCalledWith('削除できません'));
  });
});
