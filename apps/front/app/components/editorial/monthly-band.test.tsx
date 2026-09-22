import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {MonthlyBand} from './monthly-band';

const monthly = {
  uid: 'm1',
  title: 'ぬいぐるみとしゃべる人はやさしい',
  year: 2023,
  posterUrl: 'https://image.tmdb.org/t/p/original/x.jpg',
  awards: [
    {
      organization: 'ヴェネツィア国際映画祭',
      category: '金獅子賞',
      year: 2026,
      isWinner: false,
      slug: 'venice-golden-lion',
    },
    {
      organization: 'POPEYE',
      category: '21st Century Movie Greatest Hits',
      year: 2025,
      isWinner: true,
      slug: 'popeye-21st-century',
    },
  ],
};

describe('MonthlyBand', () => {
  it('観た人の数を賞の前に添える', () => {
    render(
      <MonthlyBand monthly={{...monthly, watchedCount: 3}} currentPath="/" />,
    );

    expect(
      screen.getByText(
        '観た人 3 人 · POPEYE 21st Century Movie Greatest Hits 受賞（2025）',
      ),
    ).toBeInTheDocument();
  });

  it('観た人が 0 なら数を添えない', () => {
    render(
      <MonthlyBand monthly={{...monthly, watchedCount: 0}} currentPath="/" />,
    );

    expect(screen.queryByText(/観た人/)).not.toBeInTheDocument();
  });

  it('今月の1本の題名と年を映画ページへのリンクで出す', () => {
    render(<MonthlyBand monthly={monthly} locale="ja" currentPath="/awards" />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/movies/m1');
    expect(link).toHaveTextContent('今月の1本');
    expect(link).toHaveTextContent('ぬいぐるみとしゃべる人はやさしい');
    expect(link).toHaveTextContent('2023');
    expect(link).toHaveTextContent('みんなで観る');
  });

  it('ポスターを表示幅相当に落として出す', () => {
    const {container} = render(
      <MonthlyBand monthly={monthly} locale="ja" currentPath="/awards" />,
    );

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://image.tmdb.org/t/p/w185/x.jpg',
    );
  });

  it('ポスターが無ければ画像を出さない', () => {
    const {container} = render(
      <MonthlyBand
        monthly={{uid: 'm1', title: 'Bare', year: 2023, awards: []}}
        locale="ja"
        currentPath="/awards"
      />,
    );

    expect(container.querySelector('img')).toBeNull();
  });

  it('今月の1本の映画ページでは投稿欄へのリンクにする', () => {
    render(
      <MonthlyBand monthly={monthly} locale="ja" currentPath="/movies/m1" />,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '#article-links');
    expect(link).toHaveTextContent('この映画が今月の1本');
    expect(link).toHaveTextContent('記事・ポストを貼る');
  });

  it('英語では英語の文言にする', () => {
    render(<MonthlyBand monthly={monthly} locale="en" currentPath="/awards" />);

    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('THIS MONTH');
    expect(link).toHaveTextContent('Watch together');
  });

  it('今月の1本が無ければ何も出さない', () => {
    const {container} = render(
      <MonthlyBand monthly={undefined} locale="ja" currentPath="/awards" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('受賞があればその賞を一行添える', () => {
    render(<MonthlyBand monthly={monthly} locale="ja" currentPath="/years" />);

    expect(screen.getByRole('link')).toHaveTextContent(
      'POPEYE 21st Century Movie Greatest Hits 受賞（2025）',
    );
  });

  it('賞ページではその賞のノミネートを優先して添える', () => {
    render(
      <MonthlyBand
        monthly={monthly}
        locale="ja"
        currentPath="/awards/venice-golden-lion/2026"
      />,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveTextContent(
      'ヴェネツィア国際映画祭 金獅子賞 選出（2026）',
    );
    expect(link).not.toHaveTextContent('POPEYE');
  });

  it('受賞が無ければ先頭のノミネートを添える', () => {
    render(
      <MonthlyBand
        monthly={{...monthly, awards: [monthly.awards[0]]}}
        locale="ja"
        currentPath="/years"
      />,
    );

    expect(screen.getByRole('link')).toHaveTextContent(
      'ヴェネツィア国際映画祭 金獅子賞 選出（2026）',
    );
  });

  it('英語では英語の賞の行にする', () => {
    render(<MonthlyBand monthly={monthly} locale="en" currentPath="/years" />);

    expect(screen.getByRole('link')).toHaveTextContent(
      'Won POPEYE 21st Century Movie Greatest Hits (2025)',
    );
  });

  it('ノミネートが無ければ賞の行を出さない', () => {
    render(
      <MonthlyBand
        monthly={{...monthly, awards: []}}
        locale="ja"
        currentPath="/years"
      />,
    );

    expect(screen.getByRole('link')).not.toHaveTextContent('受賞');
    expect(screen.getByRole('link')).not.toHaveTextContent('選出');
  });
});
