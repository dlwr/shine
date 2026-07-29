import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {SiteFooter} from './site-footer';

describe('SiteFooter', () => {
  it('日本語ロケールではサイトの説明を日本語で表示する', () => {
    render(<SiteFooter locale="ja" />);

    expect(screen.getByText(/毎日・毎週・毎月それぞれ1本ずつ/)).toBeVisible();
  });

  it('英語ロケールではサイトの説明を英語で表示する', () => {
    render(<SiteFooter locale="en" />);

    expect(
      screen.getByText(/one film a day, a week, and a month/i),
    ).toBeVisible();
  });

  it('選出元となる映画賞を挙げる', () => {
    render(<SiteFooter locale="ja" />);

    expect(screen.getByText(/カンヌ/)).toBeVisible();
  });

  it('TMDbの利用規約で求められる表記を載せる', () => {
    render(<SiteFooter locale="ja" />);

    expect(
      screen.getByText(/This product uses the TMDb API but is not endorsed/i),
    ).toBeVisible();
  });

  it('TMDbへのリンクを張る', () => {
    render(<SiteFooter locale="ja" />);

    expect(screen.getByRole('link', {name: /TMDb/i})).toHaveAttribute(
      'href',
      'https://www.themoviedb.org/',
    );
  });

  it('検索ページへ導線を置く', () => {
    render(<SiteFooter locale="ja" />);

    expect(screen.getByRole('link', {name: /検索/})).toHaveAttribute(
      'href',
      '/search',
    );
  });
});
