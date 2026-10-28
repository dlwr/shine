import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import type {MovieDetailData} from '@/lib/movie-detail';
import {MovieWatchSection} from './movie-watch-section';

describe('MovieWatchSection', () => {
  it('題名入りの見出しを付ける', () => {
    render(
      <MovieWatchSection
        movieDetail={{uid: 'movie-1', year: 2015} as MovieDetailData}
        title="さざなみ"
        locale="ja"
      />,
    );

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: '『さざなみ』を観る方法（配信・レンタル）',
      }),
    ).toBeInTheDocument();
  });
});
