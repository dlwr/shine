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

  it('既定では遅延読み込みする', () => {
    render(<PosterFrame posterUrl="https://x/p.jpg" alt="Parasite poster" />);
    expect(screen.getByAltText('Parasite poster')).toHaveAttribute(
      'loading',
      'lazy',
    );
  });

  it('既定ではデコードを非同期にする', () => {
    render(<PosterFrame posterUrl="https://x/p.jpg" alt="Parasite poster" />);
    expect(screen.getByAltText('Parasite poster')).toHaveAttribute(
      'decoding',
      'async',
    );
  });

  it('priority を渡すと即時読み込みする', () => {
    render(
      <PosterFrame
        posterUrl="https://x/p.jpg"
        alt="Parasite poster"
        priority
      />,
    );
    expect(screen.getByAltText('Parasite poster')).toHaveAttribute(
      'loading',
      'eager',
    );
  });

  it('priority を渡すと取得優先度を上げる', () => {
    render(
      <PosterFrame
        posterUrl="https://x/p.jpg"
        alt="Parasite poster"
        priority
      />,
    );
    expect(screen.getByAltText('Parasite poster')).toHaveAttribute(
      'fetchpriority',
      'high',
    );
  });
});
