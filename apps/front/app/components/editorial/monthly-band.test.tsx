import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {MonthlyBand} from './monthly-band';

const monthly = {
  uid: 'm1',
  title: 'ぬいぐるみとしゃべる人はやさしい',
  year: 2023,
  posterUrl: 'https://image.tmdb.org/t/p/original/x.jpg',
};

describe('MonthlyBand', () => {
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
        monthly={{uid: 'm1', title: 'Bare', year: 2023}}
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
});
