import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {Masthead} from './masthead';

describe('Masthead', () => {
  it('SHINE を h1 で、検索リンクとテーマトグルを描画する', () => {
    render(<Masthead locale="en" />);
    expect(
      screen.getByRole('heading', {level: 1, name: 'SHINE'}),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', {name: /search/i})).toHaveAttribute(
      'href',
      '/search',
    );
    expect(screen.getByRole('button', {name: /theme/i})).toBeInTheDocument();
  });

  it('SHINE ロゴはトップページへのリンクにする', () => {
    render(<Masthead locale="ja" />);
    expect(screen.getByRole('link', {name: 'SHINE'})).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('AWARDS リンクを描画する', () => {
    render(<Masthead locale="ja" />);
    expect(screen.getByRole('link', {name: /awards/i})).toHaveAttribute(
      'href',
      '/awards',
    );
  });

  it('YEARS リンクを描画する', () => {
    render(<Masthead locale="ja" />);
    expect(screen.getByRole('link', {name: /years/i})).toHaveAttribute(
      'href',
      '/years',
    );
  });

  it('QUIZ リンクを描画する', () => {
    render(<Masthead locale="ja" />);
    expect(screen.getByRole('link', {name: /quiz/i})).toHaveAttribute(
      'href',
      '/quiz',
    );
  });

  it('WATCHED リンクを描画する', () => {
    render(<Masthead locale="ja" />);
    expect(screen.getByRole('link', {name: /watched/i})).toHaveAttribute(
      'href',
      '/watched',
    );
  });

  it('PEOPLE リンクを描画する', () => {
    render(<Masthead locale="ja" />);
    expect(screen.getByRole('link', {name: /people/i})).toHaveAttribute(
      'href',
      '/people',
    );
  });

  it('日本語ロケールでは日本語のタグラインを描画する', () => {
    render(<Masthead locale="ja" />);

    expect(screen.getByText(/毎日1本、埋もれた映画に/)).toBeInTheDocument();
  });

  it('英語ロケールでは英語のタグラインを描画する', () => {
    render(<Masthead locale="en" />);

    expect(screen.getByText(/A FORGOTTEN FILM/i)).toBeInTheDocument();
  });

  it('ナビゲーションは折り返す(項目を増やしても横幅からはみ出さないため)', () => {
    render(<Masthead locale="ja" />);

    const navigation = screen.getByRole('link', {
      name: /search/i,
    }).parentElement;

    expect(navigation).toHaveClass('flex-wrap');
  });
});
