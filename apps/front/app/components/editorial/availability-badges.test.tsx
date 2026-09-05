import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {AvailabilityBadges} from './availability-badges';

const checkedAt = 1_784_067_000;

describe('AvailabilityBadges', () => {
  it('見放題のサービスをサービス名ごとにバッジ表示する', () => {
    render(
      <AvailabilityBadges
        availability={[
          {
            source: 'tmdb',
            detail:
              'U-NEXT(見放題), Hulu(見放題), Amazon Video(レンタル), Apple TV Store(購入)',
            checkedAt,
          },
        ]}
      />,
    );

    expect(screen.getByText('U-NEXT 見放題')).toBeInTheDocument();
    expect(screen.getByText('Hulu 見放題')).toBeInTheDocument();
    expect(screen.queryByText(/Amazon Video/)).not.toBeInTheDocument();
  });

  it('見放題がない場合はレンタル配信ありバッジを出し、一覧をtitleに入れる', () => {
    render(
      <AvailabilityBadges
        availability={[
          {
            source: 'tmdb',
            detail: 'Amazon Video(レンタル), Apple TV Store(購入)',
            checkedAt,
          },
        ]}
      />,
    );

    const badge = screen.getByText('レンタル配信あり');
    expect(badge).toHaveAttribute(
      'title',
      expect.stringContaining('Amazon Video(レンタル)'),
    );
  });

  it('見放題があればレンタル配信ありバッジは出さない', () => {
    render(
      <AvailabilityBadges
        availability={[
          {
            source: 'tmdb',
            detail: 'U-NEXT(見放題), Amazon Video(レンタル)',
            checkedAt,
          },
        ]}
      />,
    );

    expect(screen.queryByText('レンタル配信あり')).not.toBeInTheDocument();
  });

  it('U-NEXT直接検索のヒットは見放題バッジと重複しない場合のみ表示する', () => {
    render(
      <AvailabilityBadges
        availability={[
          {source: 'tmdb', detail: 'Hulu(見放題)', checkedAt},
          {source: 'unext', detail: 'Matched: 映画X', checkedAt},
        ]}
      />,
    );

    expect(screen.getByText('U-NEXT')).toBeInTheDocument();
  });

  it('tmdbの見放題にU-NEXTがあればU-NEXT直接ヒットのバッジは重複させない', () => {
    render(
      <AvailabilityBadges
        availability={[
          {source: 'tmdb', detail: 'U-NEXT(見放題)', checkedAt},
          {source: 'unext', detail: 'Matched: 映画X', checkedAt},
        ]}
      />,
    );

    expect(screen.getByText('U-NEXT 見放題')).toBeInTheDocument();
    expect(screen.queryByText(/^U-NEXT$/)).not.toBeInTheDocument();
  });

  it('DISCASとGEOは宅配レンタルバッジ1つに統合し、内訳をtitleに入れる', () => {
    render(
      <AvailabilityBadges
        availability={[
          {source: 'discas', detail: 'Matched: 映画X', checkedAt},
          {source: 'geo', detail: 'Matched: 映画X', checkedAt},
        ]}
      />,
    );

    const badge = screen.getByText('宅配レンタル');
    expect(badge).toHaveAttribute('title', 'TSUTAYA DISCAS / ゲオ宅配レンタル');
  });

  it('GEOだけの場合も宅配レンタルバッジを出す', () => {
    render(
      <AvailabilityBadges
        availability={[{source: 'geo', detail: 'Matched: 映画X', checkedAt}]}
      />,
    );

    expect(screen.getByText('宅配レンタル')).toHaveAttribute(
      'title',
      'ゲオ宅配レンタル',
    );
  });

  it('U-NEXTの見放題バッジはU-NEXTの検索に飛ばす', () => {
    render(
      <AvailabilityBadges
        availability={[{source: 'tmdb', detail: 'U-NEXT(見放題)', checkedAt}]}
        movieTitle="浮雲"
        tmdbId={123}
      />,
    );

    expect(screen.getByRole('link', {name: 'U-NEXT 見放題'})).toHaveAttribute(
      'href',
      `https://video.unext.jp/freeword?query=${encodeURIComponent('浮雲')}`,
    );
  });

  it('U-NEXT以外の見放題バッジはTMDbの配信ページに飛ばす', () => {
    render(
      <AvailabilityBadges
        availability={[{source: 'tmdb', detail: 'Hulu(見放題)', checkedAt}]}
        movieTitle="浮雲"
        tmdbId={123}
      />,
    );

    expect(screen.getByRole('link', {name: 'Hulu 見放題'})).toHaveAttribute(
      'href',
      'https://www.themoviedb.org/movie/123/watch?locale=JP',
    );
  });

  it('レンタル配信ありバッジもTMDbの配信ページに飛ばす', () => {
    render(
      <AvailabilityBadges
        availability={[
          {source: 'tmdb', detail: 'Amazon Video(レンタル)', checkedAt},
        ]}
        movieTitle="浮雲"
        tmdbId={123}
      />,
    );

    expect(
      screen.getByRole('link', {name: 'レンタル配信あり'}),
    ).toHaveAttribute(
      'href',
      'https://www.themoviedb.org/movie/123/watch?locale=JP',
    );
  });

  it('TMDb IDが無ければJustWatchの検索に飛ばす', () => {
    render(
      <AvailabilityBadges
        availability={[{source: 'tmdb', detail: 'Hulu(見放題)', checkedAt}]}
        movieTitle="浮雲"
      />,
    );

    expect(screen.getByRole('link', {name: 'Hulu 見放題'})).toHaveAttribute(
      'href',
      expect.stringContaining('justwatch.com/jp'),
    );
  });

  it('宅配レンタルバッジはリンクにしない', () => {
    render(
      <AvailabilityBadges
        availability={[{source: 'discas', detail: 'Matched: 映画X', checkedAt}]}
        movieTitle="浮雲"
        tmdbId={123}
      />,
    );

    expect(screen.getByText('宅配レンタル')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('映画名が無ければリンクにしない', () => {
    render(
      <AvailabilityBadges
        availability={[{source: 'tmdb', detail: 'U-NEXT(見放題)', checkedAt}]}
      />,
    );

    expect(screen.getByText('U-NEXT 見放題')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('チェック日時を表示する', () => {
    render(
      <AvailabilityBadges
        availability={[{source: 'geo', detail: 'Matched', checkedAt}]}
      />,
    );

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
