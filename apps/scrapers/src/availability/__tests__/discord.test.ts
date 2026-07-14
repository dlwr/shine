import {describe, expect, it, vi} from 'vitest';
import {buildDiscordMessage, sendDiscordNotification} from '../discord';
import type {SelectionCheckSummary} from '../ensure-selection';

const okSummary: SelectionCheckSummary = {
  type: 'daily',
  finalMovie: {uid: 'movie-1', title: 'ゴッドファーザー'},
  attempts: [
    {
      movieUid: 'movie-1',
      title: 'ゴッドファーザー',
      available: true,
      results: [
        {
          source: 'tmdb',
          status: 'ok',
          detail: 'U-NEXT(見放題)',
          fromCache: false,
        },
        {source: 'geo', status: 'ng', detail: 'No match', fromCache: false},
      ],
    },
  ],
  exhausted: false,
};

const exhaustedSummary: SelectionCheckSummary = {
  type: 'weekly',
  finalMovie: {uid: 'movie-9', title: 'レア映画'},
  attempts: Array.from({length: 10}, (_, index) => ({
    movieUid: `movie-${index}`,
    title: `候補${index}`,
    available: false,
    results: [
      {source: 'tmdb', status: 'ng' as const, fromCache: false},
      {
        source: 'unext',
        status: 'error' as const,
        detail: 'boom',
        fromCache: false,
      },
    ],
  })),
  exhausted: true,
};

describe('buildDiscordMessage', () => {
  it('includes the final movie and ok sources for a successful check', () => {
    const message = buildDiscordMessage([okSummary], '2026-07-15');

    expect(message.content).toContain('2026-07-15');
    const text = JSON.stringify(message);
    expect(text).toContain('ゴッドファーザー');
    expect(text).toContain('U-NEXT(見放題)');
  });

  it('flags exhausted selections as warnings', () => {
    const message = buildDiscordMessage([exhaustedSummary], '2026-07-15');

    const text = JSON.stringify(message);
    expect(text).toContain('⚠️');
    expect(text).toContain('レア映画');
  });

  it('reports reselection counts', () => {
    const message = buildDiscordMessage([exhaustedSummary], '2026-07-15');

    expect(JSON.stringify(message)).toContain('10');
  });

  it('mentions source errors so broken scrapers are noticed', () => {
    const message = buildDiscordMessage([exhaustedSummary], '2026-07-15');

    expect(JSON.stringify(message)).toContain('unext');
  });
});

describe('sendDiscordNotification', () => {
  it('posts the payload as JSON to the webhook', async () => {
    const fetchSpy = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(async () => new Response(undefined, {status: 204}));

    await sendDiscordNotification(
      'https://discord.com/api/webhooks/x/y',
      buildDiscordMessage([okSummary], '2026-07-15'),
      fetchSpy,
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/x/y',
      expect.objectContaining({method: 'POST'}),
    );
    const body = JSON.parse(
      (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string,
    );
    expect(body.content).toBeTruthy();
  });

  it('throws when the webhook responds with an error', async () => {
    const fetchSpy = vi.fn(async () => new Response('bad', {status: 400}));

    await expect(
      sendDiscordNotification(
        'https://discord.com/api/webhooks/x/y',
        buildDiscordMessage([okSummary], '2026-07-15'),
        fetchSpy,
      ),
    ).rejects.toThrow('400');
  });
});
