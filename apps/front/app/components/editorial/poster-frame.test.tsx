import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {PosterFrame} from './poster-frame';

describe('PosterFrame', () => {
  it('posterUrl があれば img を描画する', () => {
    render(<PosterFrame posterUrl="https://x/p.jpg" alt="Parasite poster" />);
    const img = screen.getByAltText('Parasite poster');
    expect(img).toHaveAttribute('src', 'https://x/p.jpg');
  });

  it('posterUrl が無ければプレースホルダを描画する', () => {
    render(<PosterFrame alt="No poster" placeholderLabel="ポスターなし" />);
    expect(screen.getByText('ポスターなし')).toBeInTheDocument();
  });
});
