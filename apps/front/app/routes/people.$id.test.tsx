import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import PersonPage, {meta} from './people.$id';
import type {Route} from './+types/people.$id';

const person = {
  uid: 'person-kurosawa',
  name: '黒澤明',
  originalName: '黒澤明',
  credits: [
    {
      movieUid: 'movie-ran',
      title: '乱',
      year: 1985,
      posterUrl: 'https://example.com/ran.jpg',
      job: 'Director',
    },
    {
      movieUid: 'movie-taxi',
      title: '影武者',
      year: 1980,
      character: 'Extra',
    },
  ],
};

const loaderData = {person, locale: 'ja' as const};

function renderPage() {
  render(
    <PersonPage
      loaderData={loaderData}
      params={{id: 'person-kurosawa'}}
      matches={[] as never}
    />,
  );
}

describe('PersonPage', () => {
  it('人物名を見出しに出す', () => {
    renderPage();

    expect(
      screen.getByRole('heading', {name: '黒澤明', level: 1}),
    ).toBeInTheDocument();
  });

  it('参加作品を映画ページへリンクする', () => {
    renderPage();

    expect(screen.getByRole('link', {name: /乱/})).toHaveAttribute(
      'href',
      '/movies/movie-ran',
    );
  });

  it('作品数を出す', () => {
    renderPage();

    expect(screen.getByText(/2 FILMS/)).toBeInTheDocument();
  });

  it('タイトルに人物名を含む', () => {
    const descriptors = meta({
      loaderData,
    } as Route.MetaArgs) as Array<{title?: string}>;

    expect(descriptors[0].title).toContain('黒澤明');
  });
});
