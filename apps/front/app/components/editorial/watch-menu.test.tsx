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
});
