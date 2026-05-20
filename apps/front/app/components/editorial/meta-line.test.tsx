import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {MetaLine} from './meta-line';

describe('MetaLine', () => {
  it('items を中黒区切りで描画する', () => {
    render(<MetaLine items={['FRANK DARABONT', 'USA', '142MIN']} />);
    expect(screen.getByText(/FRANK DARABONT/)).toBeInTheDocument();
    expect(screen.getByText(/142MIN/)).toBeInTheDocument();
  });

  it('空配列なら何も描画しない', () => {
    const {container} = render(<MetaLine items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
