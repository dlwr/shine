import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
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

  it('投稿が無ければ最初の一人になるよう誘う', () => {
    render(<ArticleLinksSection {...baseProperties} />);

    expect(screen.getByText('まだ誰も書いていません。')).toBeInTheDocument();
  });

  it('投稿が無ければ一行でもポストの URL でもよいと添える', () => {
    render(<ArticleLinksSection {...baseProperties} />);

    expect(
      screen.getByText(
        /一行の感想でも、X や Bluesky に書いたポストの URL でも/,
      ),
    ).toBeInTheDocument();
  });

  it('今月の1本なら同じ月に観ている人がいることを添える', () => {
    render(<ArticleLinksSection {...baseProperties} isMonthlyPick />);

    expect(
      screen.getByText('今月はみんなでこの1本を観ています。'),
    ).toBeInTheDocument();
  });

  it('今月の1本でなければ月の話は出さない', () => {
    render(<ArticleLinksSection {...baseProperties} />);

    expect(
      screen.queryByText('今月はみんなでこの1本を観ています。'),
    ).not.toBeInTheDocument();
  });

  it('投稿があれば空の案内を出さない', () => {
    render(
      <ArticleLinksSection
        {...baseProperties}
        isMonthlyPick
        articleLinks={[{uid: 'a1', description: '観た'}]}
      />,
    );

    expect(
      screen.queryByText('まだ誰も書いていません。'),
    ).not.toBeInTheDocument();
  });

  it('投稿フォームの見出しを映画題名の次の階層に置く', () => {
    render(<ArticleLinksSection {...baseProperties} />);

    expect(
      screen.getByRole('heading', {name: '観たら、ひとこと残す', level: 2}),
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

  describe('本人の投稿の印', () => {
    afterEach(() => {
      localStorage.clear();
    });

    it('admin でログインしていればトークンをフォームで送る', () => {
      localStorage.setItem('adminToken', 'admin-jwt');

      const {container} = render(<ArticleLinksSection {...baseProperties} />);

      expect(container.querySelector('input[name="adminToken"]')).toHaveValue(
        'admin-jwt',
      );
    });

    it('ログインしていなければトークンの項目を出さない', () => {
      const {container} = render(<ArticleLinksSection {...baseProperties} />);

      expect(container.querySelector('input[name="adminToken"]')).toBeNull();
    });
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
