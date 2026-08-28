import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {PeopleStrip} from './people-strip';
import type {ProminentPerson} from '@/lib/people';

const PEOPLE: ProminentPerson[] = [
  {
    uid: 'person-yakusho',
    name: '役所広司',
    originalName: '役所広司',
    profilePath: '/y.jpg',
    wonCount: 19,
    nominatedCount: 35,
    topMovies: [{uid: 'movie-perfect-days', title: 'PERFECT DAYS', year: 2023}],
  },
  {
    uid: 'person-streep',
    name: 'メリル・ストリープ',
    originalName: 'Meryl Streep',
    profilePath: undefined,
    wonCount: 0,
    nominatedCount: 0,
    topMovies: [],
  },
];

describe('PeopleStrip', () => {
  it('人物の名前を出す', () => {
    render(<PeopleStrip people={PEOPLE} />);

    expect(screen.getByText('役所広司')).toBeInTheDocument();
  });

  it('人物ページへリンクする', () => {
    render(<PeopleStrip people={PEOPLE} />);

    expect(screen.getByRole('link', {name: '役所広司'})).toHaveAttribute(
      'href',
      '/people/person-yakusho',
    );
  });

  it('原語名が違えば併記する', () => {
    render(<PeopleStrip people={PEOPLE} />);

    expect(screen.getByText('Meryl Streep')).toBeInTheDocument();
  });

  it('受賞回数とノミネート回数を出す', () => {
    render(<PeopleStrip people={PEOPLE} />);

    expect(
      screen.getByLabelText('役所広司').textContent?.replaceAll(/\s+/g, ''),
    ).toContain('19回受賞/35回ノミネート');
  });

  it('受賞歴の無い人物には回数を出さない', () => {
    render(<PeopleStrip people={PEOPLE} />);

    expect(
      screen.getByLabelText('メリル・ストリープ').textContent,
    ).not.toContain('受賞');
  });

  it('代表作を出す', () => {
    render(<PeopleStrip people={PEOPLE} />);

    expect(
      screen.getByRole('link', {name: 'PERFECT DAYS 2023'}),
    ).toHaveAttribute('href', '/movies/movie-perfect-days');
  });

  it('人物が居なければ何も出さない', () => {
    const {container} = render(<PeopleStrip people={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
