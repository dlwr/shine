/**
 * 月替わりの映画に他人が付けた関連リンクの数を数えて Discord に投稿する。
 */
import process from 'node:process';
import {Command, InvalidArgumentError} from 'commander';
import {getDatabase} from '@shine/database';
import {parseOriginRules} from '@shine/utils';
import {sendDiscordNotification} from './availability/discord';
import {loadScraperEnvironment} from './common/environment';
import {fetchHatenaBookmarkCountsOrUndefined} from './hatena-bookmarks';
import {
  collectMonthlyLinkCounts,
  DEFAULT_MONTHS,
  formatNorthStarReport,
  monthlyPickPages,
  moviePageUrl,
} from './north-star';
import {
  leadingIndicatorReport,
  resolveWebAnalyticsCredentials,
} from './web-analytics';

function parseMonths(value: string): number {
  const months = Number(value);

  if (!Number.isSafeInteger(months) || months < 1) {
    throw new InvalidArgumentError(
      '--months には 1 以上の整数を指定してください',
    );
  }

  return months;
}

async function main(options: {months: number; dryRun: boolean}): Promise<void> {
  const environment = loadScraperEnvironment();
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || '';

  try {
    const counts = await collectMonthlyLinkCounts(
      getDatabase(environment),
      parseOriginRules(process.env),
      {months: options.months},
    );
    const bookmarkCounts = await fetchHatenaBookmarkCountsOrUndefined(
      counts.map(count => moviePageUrl(count.movieUid)),
    );
    const now = new Date();
    const northStar = formatNorthStarReport(counts, now, bookmarkCounts);
    const credentials = resolveWebAnalyticsCredentials(process.env);
    const leadingIndicator = credentials
      ? await leadingIndicatorReport(credentials, monthlyPickPages(counts), now)
      : 'CLOUDFLARE_API_TOKEN 未設定のため先行指標をスキップ';
    const content = `${northStar.content}\n\n${leadingIndicator}`;

    console.log(content);

    if (options.dryRun) {
      console.log('(dry-run: Discord通知はスキップ)');
      return;
    }

    if (!discordWebhookUrl) {
      console.warn('DISCORD_WEBHOOK_URL 未設定のため通知をスキップ');
      return;
    }

    await sendDiscordNotification(discordWebhookUrl, {content, embeds: []});
  } catch (error) {
    console.error('北極星の集計に失敗しました:', error);
    process.exitCode = 1;
  }
}

export function createCommand(): Command {
  return new Command()
    .name('north-star-report')
    .description(
      '月替わりの映画に他人が付けた関連リンクの数と、直近 7 日の先行指標（日本からの訪問）を Discord に投稿します',
    )
    .option(
      '--months <N>',
      `集計する月数 (default: ${DEFAULT_MONTHS})`,
      parseMonths,
      DEFAULT_MONTHS,
    )
    .option('--dry-run', '集計だけ行い、Discord には投稿しない', false)
    .addHelpText(
      'after',
      `
Environment variables:
  NORTH_STAR_OWNER_IPS           本人の投稿とみなす IP (カンマ区切り)
  NORTH_STAR_OWNER_URL_PREFIXES  本人の投稿とみなす URL の接頭辞 (カンマ区切り)
  DISCORD_WEBHOOK_URL            Discord webhook URL (通知先)
  CLOUDFLARE_API_TOKEN           Cloudflare API トークン（権限: Account Analytics:Read。無ければ先行指標をスキップ）
  CLOUDFLARE_ACCOUNT_ID          アカウント ID (default: dlwr のアカウント)
  CF_WEB_ANALYTICS_SITE_TAG      Web Analytics のサイト (default: shine-film.com)
`,
    )
    .action(main);
}
