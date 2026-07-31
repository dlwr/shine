import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {AwardTree, type AwardNomination} from './award-tree';

const noms: AwardNomination[] = [
  {
    uid: 'n1',
    isWinner: true,
    category: {name: 'Best Actor'},
    ceremony: {uid: 'c1', year: 1995},
    organization: {uid: 'o1', name: 'Academy Awards', shortName: 'Oscars'},
  },
  {
    uid: 'n2',
    isWinner: false,
    category: {name: 'Best Picture'},
    ceremony: {uid: 'c1', year: 1995},
    organization: {uid: 'o1', name: 'Academy Awards', shortName: 'Oscars'},
  },
];

describe('AwardTree', () => {
  it('組織ヘッダとカテゴリ行を描画する', () => {
    render(<AwardTree nominations={noms} />);
    expect(screen.getByText(/Oscars|Academy Awards/)).toBeInTheDocument();
    expect(screen.getByText('Best Actor')).toBeInTheDocument();
  });

  it('受賞は WINNER、ノミネートは NOMINEE バッジを出す', () => {
    render(<AwardTree nominations={noms} />);
    expect(screen.getByText(/WINNER/)).toBeInTheDocument();
    expect(screen.getByText(/NOMINEE/)).toBeInTheDocument();
  });

  it('nominations 空なら何も描画しない', () => {
    const {container} = render(<AwardTree nominations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('賞ページがある組織のヘッダは /awards/:slug へリンクする', () => {
    render(<AwardTree nominations={noms} />);
    expect(screen.getByRole('link', {name: /Oscars · 1995/})).toHaveAttribute(
      'href',
      '/awards/academy-best-picture',
    );
  });

  it('賞ページがない組織のヘッダはリンクしない', () => {
    render(
      <AwardTree
        nominations={[
          {
            uid: 'n3',
            isWinner: false,
            category: {name: 'Some Prize'},
            ceremony: {uid: 'c2', year: 2000},
            organization: {uid: 'o2', name: 'Unknown Org'},
          },
        ]}
      />,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
