/* eslint-disable unicorn/no-null */
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AddNominationForm} from './add-nomination-form';
import type {AwardsCategory, CeremonyResponse} from './types';

const ceremonyDetail: CeremonyResponse = {
  ceremony: {
    uid: 'ceremony-1',
    organizationUid: 'org-1',
    organizationName: '日本アカデミー賞',
    organizationCountry: 'Japan',
    year: 2024,
    ceremonyNumber: 47,
    startDate: null,
    endDate: null,
    location: null,
    description: null,
    imdbEventUrl: null,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
  },
  nominations: [],
  navigation: {previous: null, next: null},
};

const categories: AwardsCategory[] = [
  {uid: 'category-1', organizationUid: 'org-1', name: '最優秀作品賞'},
];

const selectedMovie = {uid: 'movie-1', title: '七人の侍', year: 1954};

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

beforeEach(() => {
  vi.resetAllMocks();
  mockLocalStorage.getItem.mockReturnValue('admin-token');
  Object.defineProperty(globalThis, 'fetch', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
});

const renderForm = (
  overrides: Partial<Parameters<typeof AddNominationForm>[0]> = {},
) => {
  const properties: Parameters<typeof AddNominationForm>[0] = {
    apiUrl: 'http://localhost:8787',
    ceremonyDetail,
    selectedMovie,
    categories,
    message: undefined,
    onMessage: vi.fn(),
    onAdded: vi.fn(async () => {
      // noop
    }),
    ...overrides,
  };

  render(<AddNominationForm {...properties} />);
  return properties;
};

describe('AddNominationForm', () => {
  it('映画が未選択の場合は追加ボタンがdisabledになる', () => {
    renderForm({selectedMovie: undefined});

    expect(screen.getByRole('button', {name: '映画を追加'})).toBeDisabled();
  });

  it('部門未選択で送信するとonMessageにエラーを渡す', async () => {
    const {onMessage} = renderForm();

    const form = screen
      .getByRole('button', {name: '映画を追加'})
      .closest('form');
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith('部門を選択してください。');
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('送信でPOST /admin/movies/:uid/nominationsに内容を送信する', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    renderForm();

    fireEvent.change(screen.getByLabelText('部門'), {
      target: {value: 'category-1'},
    });
    fireEvent.click(screen.getByLabelText('受賞として登録'));
    fireEvent.change(screen.getByLabelText('特記事項'), {
      target: {value: '特別上映'},
    });
    fireEvent.click(screen.getByRole('button', {name: '映画を追加'}));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8787/admin/movies/movie-1/nominations',
        expect.objectContaining({method: 'POST'}),
      );
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      ceremonyUid: 'ceremony-1',
      categoryUid: 'category-1',
      isWinner: true,
      specialMention: '特別上映',
    });
  });

  it('追加成功後にonAddedと成功メッセージのonMessageを呼ぶ', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    const {onAdded, onMessage} = renderForm();

    fireEvent.change(screen.getByLabelText('部門'), {
      target: {value: 'category-1'},
    });
    fireEvent.click(screen.getByRole('button', {name: '映画を追加'}));

    await waitFor(() => {
      expect(onAdded).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith('映画を追加しました。');
    });
  });
});
