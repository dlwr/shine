import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {WatchMenu} from './watch-menu';

describe('WatchMenu', () => {
  it('主要サービスのリンクをタイトル入りで描画する', () => {
    render(<WatchMenu title="Parasite" year={2019} locale="ja" />);
    const unext = screen.getByRole('link', {name: /U-NEXT/});
    expect(unext).toHaveAttribute('href', expect.stringContaining('Parasite'));
    expect(screen.getByRole('link', {name: /IMDb/})).toBeInTheDocument();
  });

  it('Google検索のリンクをタイトルと年入りで描画する', () => {
    render(<WatchMenu title="Parasite" year={2019} locale="ja" />);
    const google = screen.getByRole('link', {name: /Google/});
    expect(google).toHaveAttribute(
      'href',
      expect.stringContaining('https://www.google.com/search'),
    );
    expect(google).toHaveAttribute('href', expect.stringContaining('Parasite'));
    expect(google).toHaveAttribute('href', expect.stringContaining('2019'));
  });

  it('GEO（ゲオ）検索のリンクをタイトル入りで描画する', () => {
    render(<WatchMenu title="Parasite" year={2019} locale="ja" />);
    const geo = screen.getByRole('link', {name: /GEO/});
    expect(geo).toHaveAttribute(
      'href',
      expect.stringContaining(
        'https://ec.geo-online.co.jp/shop/goods/search.aspx',
      ),
    );
    expect(geo).toHaveAttribute('href', expect.stringContaining('Parasite'));
  });
});
