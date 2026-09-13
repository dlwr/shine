import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {MovieDetailErrorView} from './movie-detail-error-view';

describe('MovieDetailErrorView', () => {
  it('404 なら見つからない旨の見出しを出す', () => {
    render(<MovieDetailErrorView error="無い" status={404} />);

    expect(
      screen.getByRole('heading', {name: '映画が見つかりません'}),
    ).toBeInTheDocument();
  });

  it('404 以外はエラーの見出しを出す', () => {
    render(<MovieDetailErrorView error="落ちた" status={500} />);

    expect(
      screen.getByRole('heading', {name: 'エラーが発生しました'}),
    ).toBeInTheDocument();
  });

  it('渡されたエラー文を表示する', () => {
    render(<MovieDetailErrorView error="APIへの接続に失敗しました" />);

    expect(screen.getByText('APIへの接続に失敗しました')).toBeInTheDocument();
  });

  it('ホームへ戻るリンクを出す', () => {
    render(<MovieDetailErrorView error="x" />);

    expect(screen.getByRole('link', {name: '← SHINE'})).toHaveAttribute(
      'href',
      '/',
    );
  });
});
