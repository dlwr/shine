import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {SearchRow} from './search-row';

describe('SearchRow', () => {
  it('年号・タイトルを描画し詳細へリンクする', () => {
    render(
      <SearchRow
        movie={{uid: 'm1', title: 'PARASITE', year: 2019}}
        locale="en"
      />,
    );
    const link = screen.getByRole('link', {name: /PARASITE/});
    expect(link).toHaveAttribute('href', '/movies/m1');
    expect(screen.getByText('19')).toBeInTheDocument();
  });
});
