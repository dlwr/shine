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

  it('GEO（ゲオ）宅配レンタル検索をEUC-JP対応のフォームで描画する', () => {
    render(<WatchMenu title="パラサイト" year={2019} locale="ja" />);
    const geoButton = screen.getByRole('button', {name: /GEO/});
    const form = geoButton.closest('form');
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute(
      'action',
      'https://rental.geo-online.co.jp/search2/',
    );
    expect(form).toHaveAttribute('method', 'GET');
    expect(form).toHaveAttribute('accept-charset', 'euc-jp');
    expect(form).toHaveAttribute('target', '_blank');

    const input = form!.querySelector('input[name="q"]');
    expect(input).toHaveAttribute('value', 'パラサイト');
  });
});
