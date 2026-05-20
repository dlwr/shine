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
});
