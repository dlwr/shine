import process from 'node:process';
import {Command} from 'commander';
import {sendDiscordNotification} from './availability/discord';
import {loadEnvironmentFiles} from './common/environment';
import {
  evaluateD1Usage,
  fetchD1Usage,
  PRODUCTION_D1_DATABASE_ID,
} from './d1-usage';
import {billingCycle} from './turso-usage';
import {DEFAULT_CLOUDFLARE_ACCOUNT_ID} from './web-analytics';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

async function main(options: {
  summary: boolean;
  dryRun: boolean;
}): Promise<void> {
  loadEnvironmentFiles();

  const token = process.env.CLOUDFLARE_API_TOKEN || '';
  if (!token) {
    console.error('CLOUDFLARE_API_TOKEN が設定されていません');
    process.exitCode = 1;
    return;
  }

  const credentials = {
    token,
    account: process.env.CLOUDFLARE_ACCOUNT_ID || DEFAULT_CLOUDFLARE_ACCOUNT_ID,
  };
  const databaseId = process.env.D1_DATABASE_ID || PRODUCTION_D1_DATABASE_ID;
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || '';

  try {
    const now = new Date();
    const {start} = billingCycle(now);
    const [lastHour, last24h, monthToDate] = await Promise.all([
      fetchD1Usage(
        credentials,
        databaseId,
        new Date(now.getTime() - HOUR_MS),
        now,
      ),
      fetchD1Usage(
        credentials,
        databaseId,
        new Date(now.getTime() - DAY_MS),
        now,
      ),
      fetchD1Usage(credentials, databaseId, start, now),
    ]);

    const {alerts, summary} = evaluateD1Usage({
      lastHourRowsRead: lastHour.rowsRead,
      last24hRowsRead: last24h.rowsRead,
      monthToDateRowsRead: monthToDate.rowsRead,
      monthToDateRowsWritten: monthToDate.rowsWritten,
      now,
    });

    const content =
      alerts.length > 0
        ? [
            '⚠️ D1 の読み書きが多すぎる（D1 は上限なしで課金される）',
            ...alerts.map(alert => `- ${alert}`),
            summary,
          ].join('\n')
        : summary;

    console.log(content);

    if (options.dryRun) {
      console.log('(dry-run: Discord通知はスキップ)');
      return;
    }

    if (!options.summary && alerts.length === 0) {
      return;
    }

    if (!discordWebhookUrl) {
      console.warn('DISCORD_WEBHOOK_URL 未設定のため通知をスキップ');
      return;
    }

    await sendDiscordNotification(discordWebhookUrl, {content, embeds: []});
  } catch (error) {
    console.error('D1 利用量の取得に失敗しました:', error);
    if (discordWebhookUrl && !options.dryRun) {
      try {
        await sendDiscordNotification(discordWebhookUrl, {
          content: `🚨 D1 利用量チェックがエラーで停止: ${error instanceof Error ? error.message : String(error)}`,
          embeds: [],
        });
      } catch {
        // 通知自体の失敗はexit codeで拾う
      }
    }

    process.exitCode = 1;
  }
}

export function createCommand(): Command {
  return new Command()
    .name('d1-usage-alert')
    .description(
      [
        'D1 の読み書きの量を Cloudflare の GraphQL から取り、閾値を超えていたら Discord に警告します。',
        '--summary を付けると警告が無くても現在値を1行投稿します。',
      ].join('\n'),
    )
    .option('--summary', '警告が無くても現在の量を Discord に投稿する', false)
    .option('--dry-run', '取得と判定だけ行い、Discord には投稿しない', false)
    .addHelpText(
      'after',
      `
Environment variables:
  CLOUDFLARE_API_TOKEN    Account Analytics:Read のトークン
  CLOUDFLARE_ACCOUNT_ID   アカウント ID (default: dlwr のアカウント)
  D1_DATABASE_ID          見る D1 (default: shine-production)
  DISCORD_WEBHOOK_URL     Discord webhook URL (通知先)
`,
    )
    .action(main);
}
