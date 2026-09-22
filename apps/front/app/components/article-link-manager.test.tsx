import '@testing-library/jest-dom';
import {fireEvent, render, screen} from '@testing-library/react';
import {useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import ArticleLinkManager from './article-link-manager';
import type {MovieDetails} from '@/components/admin/movie-info/types';

type ManagedLink = MovieDetails['articleLinks'][number];

function Harness({initialLinks}: {initialLinks: ManagedLink[]}) {
  const [state, setState] = useState<{articleLinks: ManagedLink[]} | undefined>(
    {articleLinks: initialLinks},
  );

  return (
    <ArticleLinkManager
      movieId="movie-1"
      apiUrl="https://api.test"
      articleLinks={state?.articleLinks ?? []}
      onArticleLinksUpdate={setState}
    />
  );
}

const otherLink: ManagedLink = {
  uid: 'link-1',
  url: 'https://open.spotify.com/episode/abc',
  title: 'ポッドキャスト',
  description: null,
  isSpam: false,
  isOwnerSubmission: false,
};

describe('ArticleLinkManager の本人の印', () => {
  beforeEach(() => {
    localStorage.setItem('adminToken', 'admin-jwt');
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('本人の投稿にすると印を付ける API を呼ぶ', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ok: true, status: 200});
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness initialLinks={[otherLink]} />);

    fireEvent.click(screen.getByRole('button', {name: '本人の投稿にする'}));

    await screen.findByText('本人');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect([url, init.method, init.body]).toEqual([
      'https://api.test/admin/article-links/link-1/owner',
      'PUT',
      JSON.stringify({isOwnerSubmission: true}),
    ]);
  });

  it('本人の印が付いた投稿は印を外すボタンを出す', () => {
    render(
      <Harness initialLinks={[{...otherLink, isOwnerSubmission: true}]} />,
    );

    expect(
      screen.getByRole('button', {name: '本人の印を外す'}),
    ).toBeInTheDocument();
  });
});
