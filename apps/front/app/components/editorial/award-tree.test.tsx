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
    organization: {
      uid: 'o1',
      name: 'Some New Award',
      shortName: 'SNA',
      slug: 'some-new-award',
      hasYearPages: true,
    },
  },
  {
    uid: 'n2',
    isWinner: false,
    category: {name: 'Best Picture'},
    ceremony: {uid: 'c1', year: 1995},
    organization: {
      uid: 'o1',
      name: 'Some New Award',
      shortName: 'SNA',
      slug: 'some-new-award',
      hasYearPages: true,
    },
  },
];

const japaneseNoms: AwardNomination[] = [
  {
    uid: 'n5',
    isWinner: false,
    specialMention: '5位',
    category: {name: 'Best Japanese Film', displayName: '日本映画ベスト・テン'},
    ceremony: {uid: 'c4', year: 1950},
    organization: {
      uid: 'o4',
      name: 'Kinema Junpo',
      displayName: 'キネマ旬報',
      slug: 'kinema-junpo-japanese',
      hasYearPages: true,
    },
  },
];

describe('AwardTree', () => {
  it('組織ヘッダとカテゴリ行を描画する', () => {
    render(<AwardTree nominations={noms} />);
    expect(screen.getByText(/SNA|Some New Award/)).toBeInTheDocument();
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

  it('年別ページを持つ組織のヘッダは /awards/:slug/:year へリンクする', () => {
    render(<AwardTree nominations={noms} />);
    expect(screen.getByRole('link', {name: /SNA · 1995/})).toHaveAttribute(
      'href',
      '/awards/some-new-award/1995',
    );
  });

  it('年別ページがない組織のヘッダは /awards/:slug へリンクする', () => {
    render(
      <AwardTree
        nominations={[
          {
            uid: 'n4',
            isWinner: false,
            category: {name: 'Top 100'},
            ceremony: {uid: 'c3', year: 2022},
            organization: {
              uid: 'o3',
              name: 'Variety',
              slug: 'variety-top-100',
              hasYearPages: false,
            },
          },
        ]}
      />,
    );
    expect(screen.getByRole('link', {name: /Variety · 2022/})).toHaveAttribute(
      'href',
      '/awards/variety-top-100',
    );
  });

  it('日本語の表示名があれば組織ヘッダに使う', () => {
    render(<AwardTree nominations={japaneseNoms} />);
    expect(
      screen.getByRole('link', {name: /キネマ旬報 · 1950/}),
    ).toBeInTheDocument();
  });

  it('日本語の表示名があればカテゴリ行に使う', () => {
    render(<AwardTree nominations={japaneseNoms} />);
    expect(screen.getByText('日本映画ベスト・テン')).toBeInTheDocument();
  });

  it('順位があれば表示する', () => {
    render(<AwardTree nominations={japaneseNoms} />);
    expect(screen.getByText('5位')).toBeInTheDocument();
  });

  it('slugがない組織のヘッダはリンクしない', () => {
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
