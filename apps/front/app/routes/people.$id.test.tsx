import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import PersonPage, {meta, type PersonData} from './people.$id';
import type {Route} from './+types/people.$id';

const person: PersonData = {
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
      awards: [
        {slug: 'academy-best-picture', isWinner: false},
        {slug: '1001-movies', isWinner: true},
      ],
    },
    {
      movieUid: 'movie-taxi',
      title: '影武者',
      year: 1980,
      jobs: [],
      character: 'Extra',
      awards: [{slug: 'palme-dor', isWinner: true}],
    },
  ],
  awards: [
    {
      slug: 'palme-dor',
      shortLabel: 'カンヌ',
      name: 'パルム・ドール',
      organization: 'カンヌ国際映画祭',
      grouping: 'year',
    },
    {
      slug: 'academy-best-picture',
      shortLabel: 'アカデミー',
      name: '作品賞',
      organization: 'アカデミー賞',
      grouping: 'year',
    },
    {
      slug: '1001-movies',
      shortLabel: '1001本',
      name: '死ぬまでに観たい映画1001本',
      organization: '1001 Movies You Must See Before You Die',
      grouping: 'list',
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

  it('参加作に賞の短縮ラベルを出す', () => {
    renderPage();

    expect(screen.getByText('カンヌ')).toBeInTheDocument();
  });

  it('リスト型の賞も短縮ラベルを出す', () => {
    renderPage();

    expect(screen.getByText('1001本')).toBeInTheDocument();
  });

  it('年度制の賞の勝敗を出す', () => {
    renderPage();

    expect(
      screen.getByText(
        (_, element) => element?.textContent === '1作受賞 / 2作ノミネート',
      ),
    ).toBeInTheDocument();
  });

  it('年度制の賞に縁が無ければ勝敗を出さない', () => {
    renderPage({
      credits: [
        {
          movieUid: 'movie-ran',
          title: '乱',
          year: 1985,
          jobs: ['Director'],
          awards: [{slug: '1001-movies', isWinner: true}],
        },
      ],
    });

    expect(screen.queryByText(/作受賞/)).not.toBeInTheDocument();
  });

  it('説明文に受賞作の本数を含む', () => {
    const descriptors = meta({
      loaderData,
    } as Route.MetaArgs) as Array<{name?: string; content?: string}>;

    expect(
      descriptors.find(descriptor => descriptor.name === 'description')
        ?.content,
    ).toContain('1本が受賞');
  });
});
