/* eslint-disable unicorn/no-null */
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {CeremonyForm} from './ceremony-form';
import type {AwardsOrganization, CeremonyResponse} from './types';

const organizations: AwardsOrganization[] = [
  {uid: 'org-1', name: '日本アカデミー賞', country: 'Japan', shortName: 'JAA'},
];

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
    location: '東京',
    description: null,
    imdbEventUrl: null,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
  },
  nominations: [],
  navigation: {previous: null, next: null},
};

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
  overrides: Partial<Parameters<typeof CeremonyForm>[0]> = {},
) => {
  const properties: Parameters<typeof CeremonyForm>[0] = {
    apiUrl: 'http://localhost:8787',
    ceremonyUid: 'ceremony-1',
    isNew: false,
    ceremonyDetail,
    awardsLoading: false,
    awardsError: undefined,
    organizations,
    onSaved: vi.fn(),
    onOrganizationUidChange: vi.fn(),
    ...overrides,
  };

  render(<CeremonyForm {...properties} />);
  return properties;
};

describe('CeremonyForm', () => {
  it('ceremonyDetailの開催年がフォームに反映される', async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByLabelText('開催年')).toHaveValue(2024);
    });
  });

  it('ceremonyDetailの開催場所がフォームに反映される', async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByLabelText('開催場所')).toHaveValue('東京');
    });
  });

  it('主催団体の選択値をonOrganizationUidChangeで通知する', async () => {
    const {onOrganizationUidChange} = renderForm();

    await waitFor(() => {
      expect(onOrganizationUidChange).toHaveBeenCalledWith('org-1');
    });
  });

  it('保存でPUT /admin/ceremonies/:uidにフォーム内容を送信する', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ceremonyDetail,
    });

    const {onSaved} = renderForm();

    await waitFor(() => {
      expect(screen.getByLabelText('開催年')).toHaveValue(2024);
    });

    fireEvent.click(screen.getByRole('button', {name: '保存する'}));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8787/admin/ceremonies/ceremony-1',
        expect.objectContaining({method: 'PUT'}),
      );
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      organizationUid: 'org-1',
      year: '2024',
      ceremonyNumber: 47,
      location: '東京',
    });
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer admin-token',
    );

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(ceremonyDetail);
    });
  });

  it('主催団体が未選択の場合はエラーメッセージを表示する', async () => {
    renderForm({
      isNew: true,
      ceremonyUid: 'new',
      ceremonyDetail: undefined,
      organizations: [],
    });

    const form = screen.getByRole('button', {name: '保存する'}).closest('form');
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => {
      expect(
        screen.getByText('主催団体を選択してください。'),
      ).toBeInTheDocument();
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
