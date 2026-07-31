import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ImdbIdEditor} from './imdb-id-editor';

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(globalThis, 'alert', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
});

describe('ImdbIdEditor', () => {
  it('IMDb IDが未設定の場合は未設定と表示する', () => {
    render(
      <ImdbIdEditor
        imdbId={undefined}
        imdbError={undefined}
        onImdbErrorChange={vi.fn()}
        performImdbUpdate={vi.fn()}
      />,
    );

    expect(screen.getByText('未設定')).toBeInTheDocument();
  });

  it('保存でperformImdbUpdateに入力値とfetchTmdbDataを渡す', async () => {
    const performImdbUpdate = vi.fn().mockResolvedValue(true);

    render(
      <ImdbIdEditor
        imdbId={undefined}
        imdbError={undefined}
        onImdbErrorChange={vi.fn()}
        performImdbUpdate={performImdbUpdate}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: '編集'}));
    fireEvent.change(screen.getByPlaceholderText('tt1234567'), {
      target: {value: 'tt7654321'},
    });
    fireEvent.click(screen.getByLabelText('TMDb から追加データを取得'));
    fireEvent.click(screen.getByRole('button', {name: '保存'}));

    await waitFor(() => {
      expect(performImdbUpdate).toHaveBeenCalledWith('tt7654321', {
        fetchTmdbData: true,
      });
    });
    await waitFor(() => {
      expect(globalThis.alert).toHaveBeenCalledWith('IMDb IDを更新しました');
    });
  });

  it('更新失敗時はonImdbErrorChangeにエラーメッセージを渡す', async () => {
    const onImdbErrorChange = vi.fn();
    const performImdbUpdate = vi
      .fn()
      .mockRejectedValue(new Error('IMDb IDの形式が不正です'));

    render(
      <ImdbIdEditor
        imdbId={undefined}
        imdbError={undefined}
        onImdbErrorChange={onImdbErrorChange}
        performImdbUpdate={performImdbUpdate}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: '編集'}));
    fireEvent.change(screen.getByPlaceholderText('tt1234567'), {
      target: {value: 'bad-id'},
    });
    fireEvent.click(screen.getByRole('button', {name: '保存'}));

    await waitFor(() => {
      expect(onImdbErrorChange).toHaveBeenCalledWith('IMDb IDの形式が不正です');
    });
  });

  it('imdbErrorがある場合はエラーメッセージを表示する', () => {
    render(
      <ImdbIdEditor
        imdbId="tt0000001"
        imdbError="更新に失敗しました"
        onImdbErrorChange={vi.fn()}
        performImdbUpdate={vi.fn()}
      />,
    );

    expect(screen.getByText('更新に失敗しました')).toBeInTheDocument();
  });
});
