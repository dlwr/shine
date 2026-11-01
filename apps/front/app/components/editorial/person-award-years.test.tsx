import '@testing-library/jest-dom';
import {render, screen, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  PersonAwardYearSection,
  type PersonAwardYearGroupData,
} from './person-award-years';

function nominee(
  uid: string,
  name: string,
  title: string,
  isWinner = false,
): PersonAwardYearGroupData['nominees'][number] {
  return {
    uid,
    name,
    originalName: name,
    profilePath: undefined,
    isWinner,
    movies: [{uid: `movie-${uid}`, title, movieYear: 2020}],
  };
}

const group: PersonAwardYearGroupData = {
  year: 2021,
  ceremonyNumber: 44,
  nominees: [
    nominee('ninomiya', '二宮和也', '浅田家!'),
    nominee('kusanagi', '草彅剛', 'ミッドナイトスワン', true),
    nominee('sato', '佐藤浩市', 'Fukushima 50'),
  ],
};

describe('PersonAwardYearSection', () => {
  it('受賞者を先に、候補は一覧にまとめて出す', () => {
    render(<PersonAwardYearSection group={group} />);

    expect(screen.getByText('受賞')).toBeInTheDocument();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map(item => item.textContent)).toEqual([
      '二宮和也浅田家!',
      '佐藤浩市Fukushima 50',
    ]);
    expect(screen.getByRole('link', {name: '草彅剛'})).toHaveAttribute(
      'href',
      '/people/kusanagi',
    );
  });

  it('候補が受賞者だけなら一覧を出さない', () => {
    render(
      <PersonAwardYearSection
        group={{...group, nominees: [group.nominees[1]]}}
      />,
    );

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
