import {describe, expect, it, vi} from 'vitest';
import {dispatchMonthlyLinkPosted} from '../monthly-link-dispatch';

const submission = {
  movieUid: 'movie-1',
  url: 'https://example.com/review',
  title: '感想',
  submitterIp: '203.0.113.9',
};

describe('dispatchMonthlyLinkPosted', () => {
  it('トークンが無ければ何もしない', async () => {
    const fetchImpl = vi.fn();

    await dispatchMonthlyLinkPosted({}, submission, fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('他人の投稿なら repository_dispatch を送る', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ok: true, status: 204});

    await dispatchMonthlyLinkPosted(
      {GITHUB_DISPATCH_TOKEN: 'ghp_test'},
      submission,
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/dlwr/shine/dispatches');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe(
      'Bearer ghp_test',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      event_type: 'monthly-link-posted',
      client_payload: {movieUid: 'movie-1'},
    });
  });

  it('本人の投稿は送らない', async () => {
    const fetchImpl = vi.fn();

    await dispatchMonthlyLinkPosted(
      {GITHUB_DISPATCH_TOKEN: 'ghp_test'},
      {...submission, isOwnerSubmission: true},
      fetchImpl,
    );

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('ループバックからのテスト投稿は送らない', async () => {
    const fetchImpl = vi.fn();

    await dispatchMonthlyLinkPosted(
      {GITHUB_DISPATCH_TOKEN: 'ghp_test'},
      {...submission, submitterIp: '127.0.0.1'},
      fetchImpl,
    );

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('GitHub が失敗しても投げない', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const fetchImpl = vi.fn().mockRejectedValue(new Error('down'));

    await expect(
      dispatchMonthlyLinkPosted(
        {GITHUB_DISPATCH_TOKEN: 'ghp_test'},
        submission,
        fetchImpl,
      ),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('GitHub が状態コードを返して失敗したら Discord に知らせる', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('discord')
        ? {ok: true, status: 204}
        : {ok: false, status: 401},
    );

    await dispatchMonthlyLinkPosted(
      {
        GITHUB_DISPATCH_TOKEN: 'ghp_test',
        DISCORD_WEBHOOK_URL: 'https://discord.test/webhook',
      },
      {...submission, movieTitle: 'リアリティー'},
      fetchImpl,
    );

    const discordCall = fetchImpl.mock.calls.find(([url]) =>
      url.includes('discord'),
    );
    expect(discordCall).toBeDefined();
    const [, init] = discordCall as unknown as [string, RequestInit];
    const {content} = JSON.parse(init.body as string) as {content: string};
    expect(content).toContain('401');
    expect(content).toContain('リアリティー');
  });

  it('GitHub が例外で失敗しても Discord に知らせる', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('discord')) {
        return {ok: true, status: 204};
      }

      throw new Error('down');
    });

    await dispatchMonthlyLinkPosted(
      {
        GITHUB_DISPATCH_TOKEN: 'ghp_test',
        DISCORD_WEBHOOK_URL: 'https://discord.test/webhook',
      },
      submission,
      fetchImpl,
    );

    expect(fetchImpl.mock.calls.some(([url]) => url.includes('discord'))).toBe(
      true,
    );
    consoleError.mockRestore();
  });

  it('GitHub が成功したら Discord に知らせない', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ok: true, status: 204});

    await dispatchMonthlyLinkPosted(
      {
        GITHUB_DISPATCH_TOKEN: 'ghp_test',
        DISCORD_WEBHOOK_URL: 'https://discord.test/webhook',
      },
      submission,
      fetchImpl,
    );

    expect(
      fetchImpl.mock.calls.some(([url]) => String(url).includes('discord')),
    ).toBe(false);
  });
});
