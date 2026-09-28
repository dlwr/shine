import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {BigYear} from './big-year';

describe('BigYear', () => {
  it('年号を分けずに一続きで描画する', () => {
    render(<BigYear year={1994} />);
    expect(screen.getByText('1994')).not.toHaveClass('text-brand');
  });

  it('year 未指定なら何も描画しない', () => {
    const {container} = render(<BigYear />);
    expect(container.firstChild).toBeNull();
  });
});
