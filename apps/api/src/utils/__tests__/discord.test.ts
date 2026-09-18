import {describe, expect, it, vi} from 'vitest';
import {postDiscordMessage} from '../discord';

describe('postDiscordMessage', () => {
  it('webhook が無ければ何もしない', async () => {
    const fetchImpl = vi.fn();

    await postDiscordMessage(undefined, 'こんにちは', fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('本文を webhook に POST する', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ok: true, status: 204});

    await postDiscordMessage(
      'https://discord.test/webhook',
      'こんにちは',
      fetchImpl,
    );

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://discord.test/webhook');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({content: 'こんにちは'});
  });

  it('Discord が失敗しても投げない', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const fetchImpl = vi.fn().mockRejectedValue(new Error('down'));

    await expect(
      postDiscordMessage(
        'https://discord.test/webhook',
        'こんにちは',
        fetchImpl,
      ),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
