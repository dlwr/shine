import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {AvailabilityBadges} from './availability-badges';

const availability = [
  {
    source: 'tmdb',
    detail: 'U-NEXT(見放題), Amazon Video(レンタル)',
    checkedAt: 1_784_067_000,
  },
  {
    source: 'discas',
    detail: 'Matched: ゴッドファーザー',
    checkedAt: 1_784_067_000,
  },
  {
    source: 'geo',
    detail: 'Matched: ゴッドファーザー',
    checkedAt: 1_784_067_000,
  },
];

describe('AvailabilityBadges', () => {
  it('ソースごとのバッジを描画する', () => {
    render(<AvailabilityBadges availability={availability} />);

    expect(screen.getByText('配信')).toBeInTheDocument();
    expect(screen.getByText('TSUTAYA DISCAS')).toBeInTheDocument();
    expect(screen.getByText('ゲオ宅配レンタル')).toBeInTheDocument();
  });

  it('配信バッジには判定の詳細をtitleで表示する', () => {
    render(<AvailabilityBadges availability={availability} />);

    expect(screen.getByText('配信')).toHaveAttribute(
      'title',
      expect.stringContaining('U-NEXT(見放題)'),
    );
  });

  it('チェック日時を表示する', () => {
    render(<AvailabilityBadges availability={availability} />);

    expect(screen.getByText(/2026-07-15\s*時点/)).toBeInTheDocument();
  });

  it('availabilityが空なら何も描画しない', () => {
    const {container} = render(<AvailabilityBadges availability={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('availability未指定でも何も描画しない', () => {
    const {container} = render(<AvailabilityBadges />);

    expect(container).toBeEmptyDOMElement();
  });
});
