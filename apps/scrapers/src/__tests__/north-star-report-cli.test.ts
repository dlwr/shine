import process from 'node:process';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {sendDiscordNotification} from '../availability/discord';
import {fetchHatenaBookmarkCountsOrUndefined} from '../hatena-bookmarks';
import {collectMonthlyLinkCounts} from '../north-star';
import {createCommand} from '../north-star-report-cli';
import {leadingIndicatorReport} from '../web-analytics';

vi.mock('dotenv', () => ({config: vi.fn()}));
vi.mock('@shine/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@shine/database')>()),
  getDatabase: vi.fn(() => ({})),
}));
vi.mock('../north-star', async importOriginal => ({
  ...(await importOriginal<typeof import('../north-star')>()),
  collectMonthlyLinkCounts: vi.fn(),
}));
vi.mock('../hatena-bookmarks', () => ({
  fetchHatenaBookmarkCountsOrUndefined: vi.fn(),
}));
vi.mock('../web-analytics', async importOriginal => ({
  ...(await importOriginal<typeof import('../web-analytics')>()),
  leadingIndicatorReport: vi.fn(),
}));
vi.mock('../availability/discord', () => ({
  sendDiscordNotification: vi.fn(),
}));

const WEBHOOK_URL = 'https://discord.example/webhook';

async function runCli(...arguments_: string[]): Promise<void> {
  await createCommand().parseAsync(arguments_, {from: 'user'});
}

function sentContent(): string {
  const [call] = vi.mocked(sendDiscordNotification).mock.calls;
  return call[1].content;
}

beforeEach(() => {
  vi.useFakeTimers({toFake: ['Date']});
  vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
  vi.stubEnv('TURSO_DATABASE_URL', 'file:north-star-report-test.db');
  vi.stubEnv('DISCORD_WEBHOOK_URL', WEBHOOK_URL);
  vi.stubEnv('CLOUDFLARE_API_TOKEN', 'token');
  vi.stubEnv('NORTH_STAR_OWNER_IPS', '');
  vi.stubEnv('NORTH_STAR_OWNER_URL_PREFIXES', '');
  vi.mocked(collectMonthlyLinkCounts)
    .mockReset()
    .mockResolvedValue([
      {
        month: '2026-10',
        movieUid: 'movie-1',
        title: '十月の映画',
        other: 1,
        owner: 2,
        test: 0,
        watched: 3,
      },
    ]);
  vi.mocked(fetchHatenaBookmarkCountsOrUndefined)
    .mockReset()
    .mockResolvedValue(new Map([['https://shine-film.com/movies/movie-1', 4]]));
  vi.mocked(leadingIndicatorReport)
    .mockReset()
    .mockResolvedValue('先行指標: PV 10');
  vi.mocked(sendDiscordNotification).mockReset();
  vi.mocked(console.log).mockClear();
  vi.mocked(console.error).mockClear();
  process.exitCode = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

describe('north-star-report', () => {
  it('北極星の内訳を Discord に送る', async () => {
    await runCli();

    expect(sentContent()).toContain(
      '2026-10 十月の映画: 他人 1 / 本人 2 / テスト 0 / 観た人 3 / はてブ 4',
    );
  });

  it('北極星の後ろに先行指標を続けて送る', async () => {
    await runCli();

    expect(sentContent()).toMatch(/はてブ 4\n\n先行指標: PV 10$/);
  });

  it('先行指標は今月の1本の映画ページを渡して取る', async () => {
    await runCli();

    expect(vi.mocked(leadingIndicatorReport).mock.calls[0][1]).toEqual([
      {month: '2026-10', title: '十月の映画', path: '/movies/movie-1'},
    ]);
  });

  it('先行指標の取得に失敗しても北極星は送る', async () => {
    vi.mocked(leadingIndicatorReport).mockRejectedValue(new Error('timeout'));

    await runCli();

    expect(sentContent()).toContain('先行指標の取得に失敗しました: timeout');
  });

  it('CLOUDFLARE_API_TOKEN が無ければ先行指標を取らずに断り書きを送る', async () => {
    vi.stubEnv('CLOUDFLARE_API_TOKEN', '');

    await runCli();

    expect(sentContent()).toContain(
      'CLOUDFLARE_API_TOKEN 未設定のため先行指標をスキップ',
    );
  });

  it('--dry-run では Discord に送らない', async () => {
    await runCli('--dry-run');

    expect(sendDiscordNotification).not.toHaveBeenCalled();
  });

  it('--months で集計する月数を渡す', async () => {
    await runCli('--months', '3');

    expect(vi.mocked(collectMonthlyLinkCounts).mock.calls[0][2]).toEqual({
      months: 3,
    });
  });

  it('集計に失敗したら終了コードを 1 にする', async () => {
    vi.mocked(collectMonthlyLinkCounts).mockRejectedValue(new Error('db'));

    await runCli();

    expect(process.exitCode).toBe(1);
  });
});
