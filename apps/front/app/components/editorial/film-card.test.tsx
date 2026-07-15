import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {FilmCard, type FilmCardMovie} from './film-card';

const movie: FilmCardMovie = {
  uid: 'm1',
  title: 'PARASITE',
  year: 2019,
  posterUrl: 'https://x/p.jpg',
  nominations: [],
};

describe('FilmCard', () => {
  it('hero variant でタイトル・年号・ポスターを描画する', () => {
    render(<FilmCard movie={movie} variant="hero" locale="en" />);
    expect(screen.getByText('PARASITE')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(screen.getByAltText(/PARASITE/)).toBeInTheDocument();
  });

  it('compact variant でもタイトルと年号を描画する', () => {
    render(<FilmCard movie={movie} variant="compact" locale="en" />);
    expect(screen.getByText('PARASITE')).toBeInTheDocument();
  });

  it('hero variant で視聴可否バッジを描画する', () => {
    render(
      <FilmCard
        movie={{
          ...movie,
          availability: [
            {
              source: 'tmdb',
              detail: 'U-NEXT(見放題)',
              checkedAt: 1_784_067_000,
            },
            {source: 'geo', detail: 'Matched', checkedAt: 1_784_067_000},
          ],
        }}
        variant="hero"
        locale="ja"
      />,
    );
    expect(screen.getByText('U-NEXT 見放題')).toBeInTheDocument();
    expect(screen.getByText('宅配レンタル')).toBeInTheDocument();
  });

  it('availabilityがなければバッジを描画しない', () => {
    render(<FilmCard movie={movie} variant="hero" locale="ja" />);
    expect(screen.queryByText('宅配レンタル')).not.toBeInTheDocument();
  });

  it('hero に label/index と受賞チップを描画する', () => {
    render(
      <FilmCard
        movie={{
          uid: 'm1',
          title: 'PARASITE',
          year: 2019,
          nominations: [
            {uid: 'n1', isWinner: true, category: {name: 'Best Picture'}},
          ],
        }}
        variant="hero"
        label="DAILY / 日替わり"
        index="NO.001"
        locale="en"
      />,
    );
    expect(screen.getByText('DAILY / 日替わり')).toBeInTheDocument();
    expect(screen.getByText('NO.001')).toBeInTheDocument();
    expect(screen.getByText('★ WINNER')).toBeInTheDocument();
  });
});
