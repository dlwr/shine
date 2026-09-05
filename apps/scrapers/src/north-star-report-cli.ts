#!/usr/bin/env -S tsx

/**
 * 月替わりの映画に他人が付けた関連リンクの数を数えて Discord に投稿する。
 */
import process from 'node:process';
import {getDatabase} from '@shine/database';
import {parseOriginRules} from '@shine/utils';
import {sendDiscordNotification} from './availability/discord';
import {loadScraperEnvironment} from './common/environment';
import {
  collectMonthlyLinkCounts,
  DEFAULT_MONTHS,
  formatNorthStarReport,
} from './north-star';

const arguments_ = process.argv.slice(2);
const flags = new Set(arguments_);
const isDryRun = flags.has('--dry-run');
const shouldHelp = flags.has('--help') || flags.has('-h');
const monthsIndex = arguments_.indexOf('--months');
const months =
  monthsIndex === -1 ? DEFAULT_MONTHS : Number(arguments_[monthsIndex + 1]);

async function main(): Promise<void> {
  if (!Number.isSafeInteger(months) || months < 1) {
    console.error('--months には 1 以上の整数を指定してください');
    process.exitCode = 1;
    return;
  }

  const environment = loadScraperEnvironment();
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || '';

  try {
    const counts = await collectMonthlyLinkCounts(
      getDatabase(environment),
      parseOriginRules(process.env),
      {months},
    );
    const {content} = formatNorthStarReport(counts, new Date());

    console.log(content);

    if (isDryRun) {
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

if (shouldHelp) {
  console.log(`
Usage: north-star-report-cli [options]

Options:
  --months N     集計する月数 (default: ${DEFAULT_MONTHS})
  --dry-run      集計だけ行い、Discord には投稿しない
  --help         このヘルプを表示

Environment variables:
  NORTH_STAR_OWNER_IPS           本人の投稿とみなす IP (カンマ区切り)
  NORTH_STAR_OWNER_URL_PREFIXES  本人の投稿とみなす URL の接頭辞 (カンマ区切り)
  DISCORD_WEBHOOK_URL            Discord webhook URL (通知先)
`);
} else {
  await main();
}
