import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {PersonPortrait} from './person-portrait';

describe('PersonPortrait', () => {
  it('写真があれば画像を出す', () => {
    render(<PersonPortrait name="黒澤明" profilePath="/kurosawa.jpg" />);

    expect(screen.getByRole('img', {name: '黒澤明'})).toHaveAttribute(
      'src',
      'https://image.tmdb.org/t/p/w185/kurosawa.jpg',
    );
  });

  it('写真が無ければ頭文字を出す', () => {
    render(<PersonPortrait name="黒澤明" />);

    expect(screen.getByText('黒')).toBeInTheDocument();
  });

  it('写真が無ければ画像を出さない', () => {
    render(<PersonPortrait name="黒澤明" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
