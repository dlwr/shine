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

  it('日本語ロケールでは日本語のタグラインを描画する', () => {
    render(<Masthead locale="ja" />);

    expect(screen.getByText(/毎日1本、埋もれた映画に/)).toBeInTheDocument();
  });

  it('英語ロケールでは英語のタグラインを描画する', () => {
    render(<Masthead locale="en" />);

    expect(screen.getByText(/A FORGOTTEN FILM/i)).toBeInTheDocument();
  });
});
