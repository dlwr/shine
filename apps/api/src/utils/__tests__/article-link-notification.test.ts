import {describe, expect, it, vi} from 'vitest';
import {notifyArticleLinkSubmission} from '../article-link-notification';

const submission = {
  movieUid: 'movie-1',
  movieTitle: 'ぬいぐるみとしゃべる人はやさしい',
  url: 'https://example.com/review',
  title: '感想',
  description: 'よかった',
  submitterIp: '203.0.113.9',
};

describe('notifyArticleLinkSubmission', () => {
  it('Webhook URL が無ければ何もしない', async () => {
    const fetchImpl = vi.fn();

    await notifyArticleLinkSubmission({}, submission, fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('他人の投稿は映画名と映画ページの URL を付けて送る', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ok: true} as Response);

    await notifyArticleLinkSubmission(
      {DISCORD_WEBHOOK_URL: 'https://discord.test/hook'},
      submission,
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.test/hook');
    const body = JSON.parse(init.body as string) as {content: string};
    expect(body.content).toContain('他人');
    expect(body.content).toContain('ぬいぐるみとしゃべる人はやさしい');
    expect(body.content).toContain(
      'https://shine-film.com/movies/movie-1#article-links',
    );
    expect(body.content).toContain('よかった');
    expect(body.content).toContain('https://example.com/review');
  });

  it('本人の投稿は本人と分かる文言で送る', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ok: true} as Response);

    await notifyArticleLinkSubmission(
      {DISCORD_WEBHOOK_URL: 'https://discord.test/hook'},
      {...submission, url: 'https://scrapbox.io/yuta25/memo'},
      fetchImpl,
    );

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {content: string};
    expect(body.content).toContain('本人');
  });

  it('ループバックからのテスト投稿は送らない', async () => {
    const fetchImpl = vi.fn();

    await notifyArticleLinkSubmission(
      {DISCORD_WEBHOOK_URL: 'https://discord.test/hook'},
      {...submission, submitterIp: '127.0.0.1'},
      fetchImpl,
    );

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('ひとことだけの投稿も送る', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ok: true} as Response);

    await notifyArticleLinkSubmission(
      {DISCORD_WEBHOOK_URL: 'https://discord.test/hook'},
      {
        movieUid: 'movie-1',
        movieTitle: '浮雲',
        description: '刺さった',
        submitterIp: '203.0.113.9',
      },
      fetchImpl,
    );

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {content: string};
    expect(body.content).toContain('刺さった');
  });

  it('Discord が落ちていても例外にしない', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(
      notifyArticleLinkSubmission(
        {DISCORD_WEBHOOK_URL: 'https://discord.test/hook'},
        submission,
        fetchImpl,
      ),
    ).resolves.toBeUndefined();
  });
});
