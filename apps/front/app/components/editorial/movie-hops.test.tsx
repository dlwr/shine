import {describe, expect, it} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {MovieHops} from './movie-hops';
import type {ConnectHopsData} from '@/lib/api-types';

function hop(uid: string, year: number): ConnectHopsData['hops'][number] {
  return {
    posterUrl: `https://example.com/${uid}.jpg`,
    links: [
      {
        person: {uid: 'p1', name: 'トム・ハンクス'},
        role: 'cast',
        movie: {uid: 'via', title: 'グリーンマイル', year: 1999},
      },
      {
        person: {uid: 'p2', name: '黒澤明'},
        role: 'director',
        movie: {uid, title: `${uid}の邦題`, year},
      },
    ],
  };
}

const hops = ['a', 'b', 'c', 'd', 'e'].map((uid, index) =>
  hop(uid, 1950 + index),
);

describe('MovieHops', () => {
  it('行き先を 3 本だけ出す', () => {
    render(<MovieHops hops={hops} />);

    expect(
      screen
        .getAllByRole('link', {name: /の邦題/})
        .map(link => link.getAttribute('href')),
    ).toEqual(['/movies/a', '/movies/b', '/movies/c']);
  });

  it('間の人物と経由する映画を出す', () => {
    render(<MovieHops hops={[hops[0]]} />);

    expect(screen.getByRole('listitem')).toHaveTextContent(
      'トム・ハンクスが出演 → 『グリーンマイル』 → 黒澤明が監督',
    );
  });

  it('別の道で次の 3 本に替える', () => {
    render(<MovieHops hops={hops} />);

    fireEvent.click(screen.getByRole('button', {name: '別の道'}));

    expect(
      screen
        .getAllByRole('link', {name: /の邦題/})
        .map(link => link.getAttribute('href')),
    ).toEqual(['/movies/d', '/movies/e', '/movies/a']);
  });

  it('3 本以下なら別の道を出さない', () => {
    render(<MovieHops hops={hops.slice(0, 3)} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('行き先が無ければ何も出さない', () => {
    const {container} = render(<MovieHops hops={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
