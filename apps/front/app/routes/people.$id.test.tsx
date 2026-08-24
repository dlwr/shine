import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import PersonPage, {meta, type PersonData} from './people.$id';
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
      jobs: ['Director', 'Screenplay'],
    },
    {
      movieUid: 'movie-taxi',
      title: '影武者',
      year: 1980,
      jobs: [],
      character: 'Extra',
    },
  ],
};

const loaderData = {person, locale: 'ja' as const};

function renderPage(overrides: Partial<PersonData> = {}) {
  render(
    <PersonPage
      loaderData={{person: {...person, ...overrides}, locale: 'ja' as const}}
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

  it('複数の役割を並べて出す', () => {
    renderPage();

    expect(screen.getByText('監督・脚本')).toBeInTheDocument();
  });

  it('顔写真を出す', () => {
    renderPage({profilePath: '/kurosawa.jpg'});

    expect(screen.getByRole('img', {name: '黒澤明'})).toHaveAttribute(
      'src',
      'https://image.tmdb.org/t/p/w342/kurosawa.jpg',
    );
  });

  it('OG画像に人物カードを指定する', () => {
    const descriptors = meta({
      loaderData,
    } as Route.MetaArgs) as Array<{property?: string; content?: string}>;

    expect(descriptors).toContainEqual({
      property: 'og:image',
      content: 'https://shine-film.com/og/person.png?id=person-kurosawa',
    });
  });
});
