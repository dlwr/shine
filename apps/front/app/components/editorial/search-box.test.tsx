import '@testing-library/jest-dom';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {SearchBox} from './search-box';

vi.stubGlobal('fetch', vi.fn());

const SUGGESTIONS = {
  movies: [{uid: 'movie-perfect-days', title: 'PERFECT DAYS', year: 2023}],
  people: [
    {
      uid: 'person-yakusho',
      name: '役所広司',
      originalName: '役所広司',
      wonCount: 19,
      nominatedCount: 35,
      topMovies: [],
    },
  ],
};

function mockSuggestions(body: unknown) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => body,
  } as Response);
}

function renderBox(onNavigate = vi.fn()) {
  render(
    <SearchBox
      apiUrl="http://localhost:8787"
      label="映画を探す"
      placeholder="映画タイトル・人物名を入力..."
      onNavigate={onNavigate}
    />,
  );
  return {
    input: screen.getByRole('searchbox', {name: '映画を探す'}),
    onNavigate,
  };
}

async function typeAndWait(input: HTMLElement, value: string) {
  fireEvent.change(input, {target: {value}});
  await screen.findByRole('listbox');
}

describe('SearchBox', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it('入力欄を GET /search のフォームに置く', () => {
    const {input} = renderBox();

    expect(input).toHaveAttribute('name', 'q');
    expect(input.closest('form')).toHaveAttribute('action', '/search');
  });

  it('初期値を入力欄に出す', () => {
    render(
      <SearchBox
        apiUrl="http://localhost:8787"
        label="映画を探す"
        defaultValue="役所"
      />,
    );

    expect(screen.getByRole('searchbox')).toHaveValue('役所');
  });

  it('2文字未満では候補を取得しない', async () => {
    const {input} = renderBox();

    fireEvent.change(input, {target: {value: '役'}});
    await new Promise(resolve => {
      setTimeout(resolve, 400);
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('入力が止まってから候補を取得する', async () => {
    mockSuggestions(SUGGESTIONS);
    const {input} = renderBox();

    await typeAndWait(input, '役所');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8787/search/suggest?q=%E5%BD%B9%E6%89%80&locale=ja',
      expect.objectContaining({signal: expect.any(AbortSignal)}),
    );
  });

  it('人物と映画の候補を出す', async () => {
    mockSuggestions(SUGGESTIONS);
    const {input} = renderBox();

    await typeAndWait(input, '役所');

    expect(screen.getByRole('link', {name: /役所広司/})).toHaveAttribute(
      'href',
      '/people/person-yakusho',
    );
    expect(screen.getByRole('link', {name: /PERFECT DAYS/})).toHaveAttribute(
      'href',
      '/movies/movie-perfect-days',
    );
  });

  it('候補が無ければ一覧を出さない', async () => {
    mockSuggestions({movies: [], people: []});
    const {input} = renderBox();

    fireEvent.change(input, {target: {value: 'zzzz'}});
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('↓と Enter で候補へ移動する', async () => {
    mockSuggestions(SUGGESTIONS);
    const {input, onNavigate} = renderBox();
    await typeAndWait(input, '役所');

    fireEvent.keyDown(input, {key: 'ArrowDown'});
    fireEvent.keyDown(input, {key: 'Enter'});

    expect(onNavigate).toHaveBeenCalledWith('/people/person-yakusho');
  });

  it('↓を2回押すと2番目の候補を選ぶ', async () => {
    mockSuggestions(SUGGESTIONS);
    const {input, onNavigate} = renderBox();
    await typeAndWait(input, '役所');

    fireEvent.keyDown(input, {key: 'ArrowDown'});
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    fireEvent.keyDown(input, {key: 'Enter'});

    expect(onNavigate).toHaveBeenCalledWith('/movies/movie-perfect-days');
  });

  it('候補を選んでいなければ Enter で移動しない', async () => {
    mockSuggestions(SUGGESTIONS);
    const {input, onNavigate} = renderBox();
    await typeAndWait(input, '役所');

    fireEvent.keyDown(input, {key: 'Enter'});

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('Escape で候補を閉じる', async () => {
    mockSuggestions(SUGGESTIONS);
    const {input} = renderBox();
    await typeAndWait(input, '役所');

    fireEvent.keyDown(input, {key: 'Escape'});

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('取得に失敗しても入力欄は使える', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
    const {input} = renderBox();

    fireEvent.change(input, {target: {value: '役所'}});
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    expect(input).toHaveValue('役所');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
