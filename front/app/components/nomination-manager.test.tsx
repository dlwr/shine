import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import NominationManager from './nomination-manager';

const awardsResponse = {
  organizations: [
    {
      uid: 'org-1',
      name: '日本アカデミー賞',
      country: 'Japan',
      shortName: 'JAA',
    },
  ],
  ceremonies: [
    {
      uid: 'ceremony-1',
      organizationUid: 'org-1',
      year: 2024,
      ceremonyNumber: 47,
      organizationName: '日本アカデミー賞',
    },
  ],
  categories: [
    {
      uid: 'category-1',
      organizationUid: 'org-1',
      name: '最優秀作品賞',
      organizationName: '日本アカデミー賞',
    },
  ],
};

const sampleNomination = {
  uid: 'nomination-1',
  isWinner: true,
  specialMention: '特別賞',
  category: {
    uid: 'category-1',
    name: '最優秀作品賞',
  },
  ceremony: {
    uid: 'ceremony-1',
    number: 47,
    year: 2024,
  },
  organization: {
    uid: 'org-1',
    name: '日本アカデミー賞',
    shortName: 'JAA',
  },
};

const originalFetch = globalThis.fetch;
const originalLocalStorage = globalThis.localStorage;
const mockLocalStorage = {
  getItem: vi.fn(() => 'admin-token'),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
};

describe('NominationManager', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLocalStorage.getItem.mockReset();
    mockLocalStorage.setItem.mockReset();
    mockLocalStorage.removeItem.mockReset();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(awardsResponse),
    } as Response);

    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });
    mockLocalStorage.getItem.mockReturnValue('admin-token');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    });
  });

  it('renders nominations table and toggles add form', async () => {
    const onUpdate = vi.fn();

    render(
      <NominationManager
        movieId="movie-123"
        apiUrl="http://localhost:8787"
        nominations={[sampleNomination]}
        onNominationsUpdate={onUpdate}
      />,
    );

    expect(screen.getByText('ノミネート管理')).toBeInTheDocument();
    expect(screen.getByText('最優秀作品賞')).toBeInTheDocument();
    expect(screen.getByText('編集')).toBeInTheDocument();

    expect(screen.queryAllByRole('combobox')).toHaveLength(0);

    const addButton = screen.getByText('ノミネートを追加') as HTMLButtonElement;
    await waitFor(() => expect(addButton.disabled).toBe(false));

    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getAllByRole('combobox')).toHaveLength(3);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:8787/admin/awards',
      expect.objectContaining({
        headers: {Authorization: 'Bearer admin-token'},
      }),
    );
  });
});
