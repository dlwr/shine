import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {AwardMovieRow} from './award-movie-row';
import type {AwardMovieEntryData} from '@/lib/api-types';

const checkedAt = 1_784_067_000;

const entry = (overrides: Partial<AwardMovieEntryData>): AwardMovieEntryData =>
  ({
    uid: 'movie-1',
    title: '映画X',
    movieYear: 2014,
    isWinner: false,
    ...overrides,
  }) as AwardMovieEntryData;

describe('AwardMovieRow', () => {
  it.each([true, false])(
    '宅配レンタルのみの作品は札を 1 つにまとめる（受賞: %s）',
    isWinner => {
      render(
        <AwardMovieRow
          movie={entry({
            isWinner,
            availabilityStatus: 'rental_only',
            availability: [{source: 'discas', detail: 'Matched', checkedAt}],
          })}
        />,
      );

      expect(screen.getAllByText('宅配レンタルのみ・要確認')).toHaveLength(1);
      expect(screen.queryByText('宅配レンタル')).not.toBeInTheDocument();
    },
  );

  it('観られない作品には印を付ける', () => {
    render(
      <AwardMovieRow
        movie={entry({availabilityStatus: 'unwatchable', availability: []})}
      />,
    );

    expect(screen.getByText('日本で観られない')).toBeInTheDocument();
  });
});
