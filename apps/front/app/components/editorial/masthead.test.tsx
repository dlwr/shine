import {describe, it, expect} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {Masthead} from './masthead';

describe('Masthead', () => {
  it('SHINE を h1 で、検索リンクとテーマトグルを描画する', () => {
    render(<Masthead locale="en" />);
    expect(
      screen.getByRole('heading', {level: 1, name: 'SHINE'}),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', {name: /search/i})).toHaveAttribute(
      'href',
      '/search',
    );
    expect(
      screen.getByRole('button', {name: /テーマを切り替える/}),
    ).toBeInTheDocument();
  });

  it('SHINE ロゴはトップページへのリンクにする', () => {
    render(<Masthead locale="ja" />);
    expect(screen.getByRole('link', {name: 'SHINE'})).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('AWARDS リンクを描画する', () => {
    render(<Masthead locale="ja" />);
    expect(screen.getByRole('link', {name: /awards/i})).toHaveAttribute(
      'href',
      '/awards',
    );
  });

  it('YEARS リンクを描画する', () => {
    render(<Masthead locale="ja" />);
    expect(screen.getByRole('link', {name: /years/i})).toHaveAttribute(
      'href',
      '/years',
    );
  });

  it('QUIZ リンクを描画する', () => {
    render(<Masthead locale="ja" />);
    expect(screen.getByRole('link', {name: /quiz/i})).toHaveAttribute(
      'href',
      '/quiz',
    );
  });

  it('WATCHED リンクを描画する', () => {
    render(<Masthead locale="ja" />);
    expect(screen.getByRole('link', {name: /watched/i})).toHaveAttribute(
      'href',
      '/watched',
    );
  });

  it('PEOPLE リンクを描画する', () => {
    render(<Masthead locale="ja" />);
    expect(screen.getByRole('link', {name: /people/i})).toHaveAttribute(
      'href',
      '/people',
    );
  });

  it('日本語ロケールでは日本語のタグラインを描画する', () => {
    render(<Masthead locale="ja" />);

    expect(screen.getByText(/毎月1本、みんなで/)).toBeInTheDocument();
  });

  it('英語ロケールでは英語のタグラインを描画する', () => {
    render(<Masthead locale="en" />);

    expect(screen.getByText(/One film a month/i)).toBeInTheDocument();
  });

  it('狭い画面ではナビの項目を閉じた状態で描画する', () => {
    render(<Masthead locale="ja" />);

    expect(screen.getByRole('button', {name: 'メニュー'})).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('閉じている間はナビの項目を狭い画面で隠す', () => {
    render(<Masthead locale="ja" />);

    expect(screen.getByRole('navigation', {name: 'Site'})).toHaveClass(
      'hidden',
    );
  });

  it('MENU を押すとナビの項目を開く', () => {
    render(<Masthead locale="ja" />);

    fireEvent.click(screen.getByRole('button', {name: 'メニュー'}));

    expect(screen.getByRole('navigation', {name: 'Site'})).not.toHaveClass(
      'hidden',
    );
  });

  it('MENU をもう一度押すとナビの項目を閉じる', () => {
    render(<Masthead locale="ja" />);
    const menu = screen.getByRole('button', {name: 'メニュー'});

    fireEvent.click(menu);
    fireEvent.click(menu);

    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  it('広い画面ではナビの項目を開閉せずに並べる', () => {
    render(<Masthead locale="ja" />);

    expect(screen.getByRole('navigation', {name: 'Site'})).toHaveClass(
      'md:contents',
    );
  });

  it('検索リンクは閉じている間も出す', () => {
    render(<Masthead locale="ja" />);

    expect(screen.getByRole('navigation', {name: 'Site'})).not.toContainElement(
      screen.getByRole('link', {name: /search/i}),
    );
  });

  it('ナビゲーションは折り返す(項目を増やしても横幅からはみ出さないため)', () => {
    render(<Masthead locale="ja" />);

    const navigation = screen.getByRole('link', {
      name: /search/i,
    }).parentElement;

    expect(navigation).toHaveClass('flex-wrap');
  });
});
