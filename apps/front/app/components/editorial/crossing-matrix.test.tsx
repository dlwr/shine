import '@testing-library/jest-dom';
import {render, screen, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {CrossingMatrix} from './crossing-matrix';

const awards = [
  {
    key: 'palme-dor',
    shortLabel: 'カンヌ',
    name: 'パルム・ドール',
    count: 1768,
    href: '/awards/palme-dor',
  },
  {
    key: 'academy-best-picture',
    shortLabel: 'アカデミー',
    name: '作品賞',
    count: 617,
    href: '/awards/academy-best-picture',
  },
  {
    key: 'variety-top-100',
    shortLabel: 'Variety',
    name: 'Top 100',
    count: 100,
  },
];

const pairs = [
  {a: 'academy-best-picture', b: 'palme-dor', shared: 62},
  {a: 'academy-best-picture', b: 'variety-top-100', shared: 37},
];

function renderMatrix(unit?: string) {
  render(<CrossingMatrix awards={awards} pairs={pairs} unit={unit} />);
}

function rowOf(label: RegExp): HTMLElement {
  const header = screen.getByRole('rowheader', {name: label});

  return header.closest('tr') as HTMLElement;
}

describe('CrossingMatrix', () => {
  it('賞の名前を行の見出しに出す', () => {
    renderMatrix();

    expect(screen.getByRole('rowheader', {name: /カンヌ/})).toBeInTheDocument();
  });

  it('賞の名前を列の見出しに出す', () => {
    renderMatrix();

    expect(
      screen.getByRole('columnheader', {name: /アカデミー/}),
    ).toBeInTheDocument();
  });

  it('組み合わせの共通本数をセルに出す', () => {
    renderMatrix();

    const row = rowOf(/カンヌ/);
    expect(within(row).getByText('62')).toBeInTheDocument();
  });

  it('共通する映画が無い組み合わせは空にする', () => {
    renderMatrix();

    const row = rowOf(/カンヌ/);
    expect(within(row).queryByText('0')).not.toBeInTheDocument();
  });

  it('自分自身との交差はセルに数を出さない', () => {
    renderMatrix();

    const row = rowOf(/Variety/);
    expect(within(row).getAllByText('37')).toHaveLength(1);
  });

  it('どの賞同士の交差かをセルの説明に書く', () => {
    renderMatrix();

    expect(screen.getByTitle('カンヌ × アカデミー 62本')).toBeInTheDocument();
  });

  it('行の見出しにその賞の作品数を添える', () => {
    renderMatrix();

    expect(within(rowOf(/カンヌ/)).getByText('1,768')).toBeInTheDocument();
  });

  it('賞ページへのリンクを見出しに張る', () => {
    renderMatrix();

    expect(screen.getByRole('link', {name: /カンヌ/})).toHaveAttribute(
      'href',
      '/awards/palme-dor',
    );
  });

  it('リンク先の無い軸は見出しを文字のまま出す', () => {
    renderMatrix();

    expect(
      screen.getByRole('rowheader', {name: /Variety/}),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', {name: /Variety/}),
    ).not.toBeInTheDocument();
  });

  it('セルの説明の単位を差し替えられる', () => {
    renderMatrix('件');

    expect(screen.getByTitle('カンヌ × アカデミー 62件')).toBeInTheDocument();
  });
});
