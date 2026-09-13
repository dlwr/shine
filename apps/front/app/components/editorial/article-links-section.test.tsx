import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {ArticleLinksSection, buildShareUrls} from './article-links-section';

describe('buildShareUrls', () => {
  it('X のポスト作成 URL に題名と映画ページの URL を入れる', () => {
    const {x} = buildShareUrls('movie-1', 'パラサイト');

    expect(x).toBe(
      `https://x.com/intent/post?text=${encodeURIComponent(
        '『パラサイト』を観た\nhttps://shine-film.com/movies/movie-1',
      )}`,
    );
  });

  it('Bluesky の投稿作成 URL に題名と映画ページの URL を入れる', () => {
    const {bluesky} = buildShareUrls('movie-1', 'パラサイト');

    expect(bluesky).toBe(
      `https://bsky.app/intent/compose?text=${encodeURIComponent(
        '『パラサイト』を観た\nhttps://shine-film.com/movies/movie-1',
      )}`,
    );
  });
});

describe('ArticleLinksSection', () => {
  const baseProperties = {
    articleLinks: [],
    movieUid: 'movie-1',
    movieTitle: 'パラサイト',
    isTestMode: true,
    formData: {url: '', title: '', description: '', captchaToken: ''},
    handleInputChange: vi.fn(),
    handleCaptchaTokenChange: vi.fn(),
    isLoadingTitle: false,
    submissionResult: undefined,
    turnstileSiteKey: 'site-key',
  };

  it('投稿が無ければ空の案内を出す', () => {
    render(<ArticleLinksSection {...baseProperties} />);

    expect(
      screen.getByText(
        'まだ投稿がありません。観たら感想や記事のリンクを貼ってください。',
      ),
    ).toBeInTheDocument();
  });

  it('URL 付きの投稿はタイトルをリンクにする', () => {
    render(
      <ArticleLinksSection
        {...baseProperties}
        articleLinks={[
          {uid: 'a1', url: 'https://example.com/post', title: '記事'},
        ]}
      />,
    );

    expect(screen.getByRole('link', {name: '記事'})).toHaveAttribute(
      'href',
      'https://example.com/post',
    );
  });

  it('投稿の失敗メッセージを出す', () => {
    render(
      <ArticleLinksSection
        {...baseProperties}
        submissionResult={{error: '投稿に失敗しました。'}}
      />,
    );

    expect(screen.getByText('投稿に失敗しました。')).toBeInTheDocument();
  });

  it('認証キーが無ければ投稿できない旨を出す', () => {
    render(
      <ArticleLinksSection {...baseProperties} turnstileSiteKey={undefined} />,
    );

    expect(
      screen.getByText(
        '認証キーが設定されていないため投稿できません。管理者にお問い合わせください。',
      ),
    ).toBeInTheDocument();
  });
});
