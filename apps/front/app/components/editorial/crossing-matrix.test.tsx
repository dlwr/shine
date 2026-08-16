import '@testing-library/jest-dom';
import {render, screen, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {CrossingMatrix} from './crossing-matrix';

const awards = [
  {
    slug: 'palme-dor',
    shortLabel: 'カンヌ',
    name: 'パルム・ドール',
    filmCount: 1768,
  },
  {
    slug: 'academy-best-picture',
    shortLabel: 'アカデミー',
    name: '作品賞',
    filmCount: 617,
  },
  {
    slug: 'variety-top-100',
    shortLabel: 'Variety',
    name: 'Top 100',
    filmCount: 100,
  },
];

const pairs = [
  {a: 'academy-best-picture', b: 'palme-dor', shared: 62},
  {a: 'academy-best-picture', b: 'variety-top-100', shared: 37},
];

function renderMatrix() {
  render(<CrossingMatrix awards={awards} pairs={pairs} />);
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
});
