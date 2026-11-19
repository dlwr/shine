import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import DevelopersPage, {meta} from './developers';

describe('DevelopersPage', () => {
  it('MCP の接続先 URL を載せる', () => {
    render(<DevelopersPage />);

    expect(screen.getAllByText('https://shine-film.com/mcp')[0]).toBeVisible();
  });

  it.each(['search_movies', 'get_movie', 'list_awards', 'get_award_year'])(
    'ツール %s でできることを書く',
    tool => {
      render(<DevelopersPage />);

      expect(screen.getByText(tool)).toBeVisible();
    },
  );

  it.each(['watchable', 'rental_only', 'unwatchable', 'unchecked'])(
    '日本で観られるかの値 %s の意味を書く',
    status => {
      render(<DevelopersPage />);

      expect(screen.getByText(status)).toBeVisible();
    },
  );

  it('互換性を約束しないことを書く', () => {
    render(<DevelopersPage />);

    expect(screen.getByText(/予告なく変わります/)).toBeVisible();
  });

  it('プライバシーの節にアンカーで直接リンクできる', () => {
    render(<DevelopersPage />);

    expect(
      screen.getByRole('heading', {name: 'プライバシー'}).closest('section'),
    ).toHaveAttribute('id', 'privacy');
  });

  it('連絡先に GitHub の issue を案内する', () => {
    render(<DevelopersPage />);

    expect(screen.getByRole('link', {name: 'GitHub の issue'})).toHaveAttribute(
      'href',
      'https://github.com/dlwr/shine/issues',
    );
  });

  it('TMDb の利用規約で求められる表記を載せる', () => {
    render(<DevelopersPage />);

    expect(
      screen.getAllByText(
        /This product uses the TMDb API but is not endorsed/i,
      )[0],
    ).toBeVisible();
  });

  it('検索エンジンの索引から外さない', () => {
    const descriptors = meta();

    expect(descriptors).not.toContainEqual(
      expect.objectContaining({name: 'robots'}),
    );
  });
});
