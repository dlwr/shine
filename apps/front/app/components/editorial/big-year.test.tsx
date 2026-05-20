import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {BigYear} from './big-year';

describe('BigYear', () => {
  it('年号を描画し下2桁をアクセント色要素にする', () => {
    render(<BigYear year={1994} />);
    expect(screen.getByText('19')).toBeInTheDocument();
    const accent = screen.getByText('94');
    expect(accent).toHaveClass('text-brand');
  });

  it('year 未指定なら何も描画しない', () => {
    const {container} = render(<BigYear />);
    expect(container.firstChild).toBeNull();
  });
});
