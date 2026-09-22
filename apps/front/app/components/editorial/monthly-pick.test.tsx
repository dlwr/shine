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
  it('観た人の数を出す', () => {
    render(<MonthlyPick movie={{...movie, watchedCount: 3}} locale="ja" />);

    expect(screen.getByText('観た人 3 人')).toBeInTheDocument();
  });

  it('観た人が 0 なら出さない', () => {
    render(<MonthlyPick movie={{...movie, watchedCount: 0}} locale="ja" />);

    expect(screen.queryByText(/観た人 /)).not.toBeInTheDocument();
  });

  it('英語では英語で観た人の数を出す', () => {
    render(<MonthlyPick movie={{...movie, watchedCount: 3}} locale="en" />);

    expect(screen.getByText('3 watched')).toBeInTheDocument();
  });

  it('タイトルを映画ページへのリンクで出す', () => {
    render(<MonthlyPick movie={movie} locale="ja" />);

    expect(screen.getByRole('link', {name: /浮雲/})).toHaveAttribute(
      'href',
      '/movies/movie-3',
    );
  });

  it('視聴手段のバッジを配信先へのリンクにする', () => {
    render(
      <MonthlyPick
        movie={{
          ...movie,
          tmdbId: 456,
          availability: [
            {
              source: 'tmdb',
              detail: 'U-NEXT(見放題)',
              checkedAt: 1_784_067_000,
            },
          ],
        }}
        locale="ja"
      />,
    );

    expect(screen.getByRole('link', {name: 'U-NEXT 見放題'})).toHaveAttribute(
      'href',
      `https://video.unext.jp/freeword?query=${encodeURIComponent('浮雲')}`,
    );
  });

  it('「今月の1本」のラベルと、みんなで観ることを書く', () => {
    render(<MonthlyPick movie={movie} locale="ja" />);

    expect(screen.getByText('MONTHLY / 今月の1本')).toBeInTheDocument();
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

describe('MonthlyPick のポスター配信', () => {
  const movie = {
    uid: 'm1',
    year: 2025,
    posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
    translations: [{languageCode: 'ja', content: '国宝', isDefault: 1}],
  } as unknown as Parameters<typeof MonthlyPick>[0]['movie'];

  it('transformImages のときは自前の /posters 経路を Image Transformations に通す', () => {
    const {container} = render(<MonthlyPick movie={movie} transformImages />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/cdn-cgi/image/format=auto,quality=70/posters/w500/abc.jpg',
    );
  });

  it('既定では TMDb の URL のまま', () => {
    const {container} = render(<MonthlyPick movie={movie} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://image.tmdb.org/t/p/w500/abc.jpg',
    );
  });

  it('これまでの今月の1本の一覧へのリンクを出す', () => {
    render(<MonthlyPick movie={movie} locale="ja" />);

    expect(
      screen.getByRole('link', {name: 'これまでの今月の1本 →'}),
    ).toHaveAttribute('href', '/monthly');
  });
});
