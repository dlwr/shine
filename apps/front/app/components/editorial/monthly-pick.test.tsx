import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {MonthlyPick} from './monthly-pick';

const movie = {
  uid: 'movie-3',
  title: '浮雲',
  year: 1955,
  posterUrl: undefined,
  nominations: [],
  articleLinks: [
    {uid: 'l1', url: 'https://example.com/a', title: '感想A'},
    {uid: 'l2', url: 'https://x.com/b/status/2', title: '@b のポスト'},
  ],
};

describe('MonthlyPick', () => {
  it('タイトルを映画ページへのリンクで出す', () => {
    render(<MonthlyPick movie={movie} locale="ja" />);

    expect(screen.getByRole('link', {name: /浮雲/})).toHaveAttribute(
      'href',
      '/movies/movie-3',
    );
  });

  it('「今月の1本」のラベルと、みんなで観ることを書く', () => {
    render(<MonthlyPick movie={movie} locale="ja" />);

    expect(screen.getByText(/今月の1本/)).toBeInTheDocument();
    expect(
      screen.getByText('毎月1本、みんなで同じ映画を観る'),
    ).toBeInTheDocument();
  });

  it('観た人の記事・ポストを新しいタブで開くリンクにする', () => {
    render(<MonthlyPick movie={movie} locale="ja" />);

    expect(screen.getByText('観た人の記事・ポスト')).toBeInTheDocument();
    const link = screen.getByRole('link', {name: '感想A'});
    expect(link).toHaveAttribute('href', 'https://example.com/a');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', {name: '@b のポスト'})).toBeInTheDocument();
  });

  it('URL のないひとことは本文として出す', () => {
    render(
      <MonthlyPick
        movie={{
          ...movie,
          articleLinks: [{uid: 'l3', description: '音がすごかった'}],
        }}
        locale="ja"
      />,
    );

    expect(screen.getByText('音がすごかった')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', {name: '音がすごかった'}),
    ).not.toBeInTheDocument();
  });

  it('投稿が無ければその旨を書く', () => {
    render(<MonthlyPick movie={{...movie, articleLinks: []}} locale="ja" />);

    expect(screen.getByText('まだ投稿がありません。')).toBeInTheDocument();
  });

  it('リンクを貼る導線は映画ページの欄へ飛ぶ', () => {
    render(<MonthlyPick movie={movie} locale="ja" />);

    expect(
      screen.getByRole('link', {name: '感想や記事のリンクを貼る'}),
    ).toHaveAttribute('href', '/movies/movie-3#article-links');
  });

  it('英語ロケールでは英語の文言にする', () => {
    render(<MonthlyPick movie={{...movie, articleLinks: []}} locale="en" />);

    expect(
      screen.getByText('One film a month, watched together'),
    ).toBeInTheDocument();
    expect(screen.getByText('No posts yet.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {name: 'Add your post or article'}),
    ).toHaveAttribute('href', '/movies/movie-3#article-links');
  });
});
