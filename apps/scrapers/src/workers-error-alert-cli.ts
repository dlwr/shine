/**
 * Workers の失敗数を Cloudflare の GraphQL から取り、1 件でもあれば Discord に警告する。
 * --summary を付けると失敗が無くても件数を1行投稿する。
 */
import process from 'node:process';
import {Command, InvalidArgumentError} from 'commander';
import {sendDiscordNotification} from './availability/discord';
import {loadEnvironmentFiles} from './common/environment';
import {evaluateWorkerErrors, fetchWorkerInvocations} from './workers-errors';

const DEFAULT_ACCOUNT_ID = '2097531fd91db13e3e83de98d54962f1';
const DEFAULT_WINDOW_HOURS = 6;
const HOUR_MS = 3_600_000;

function parseHours(value: string): number {
  const hours = Number(value);

  if (!Number.isSafeInteger(hours) || hours < 1) {
    throw new InvalidArgumentError(
      '--hours には 1 以上の整数を指定してください',
    );
  }

  return hours;
}

async function main(options: {
  hours: number;
  summary: boolean;
  dryRun: boolean;
}): Promise<void> {
  loadEnvironmentFiles();

  const isDryRun = options.dryRun;
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || '';
  const token = process.env.CLOUDFLARE_API_TOKEN || '';

  if (!token) {
    console.error('CLOUDFLARE_API_TOKEN が設定されていません');
    process.exitCode = 1;
    return;
  }

  try {
    const now = new Date();
    const invocations = await fetchWorkerInvocations(
      {
        token,
        account: process.env.CLOUDFLARE_ACCOUNT_ID || DEFAULT_ACCOUNT_ID,
      },
      new Date(now.getTime() - options.hours * HOUR_MS),
      now,
    );

    const {alerts, summary} = evaluateWorkerErrors(invocations, options.hours);
    const content =
      alerts.length > 0
        ? [
            '⚠️ Workers が失敗している',
            ...alerts.map(alert => `- ${alert}`),
            summary,
          ].join('\n')
        : summary;

    console.log(content);

    if (isDryRun) {
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
    console.error('Workers の失敗数の取得に失敗しました:', error);
    if (discordWebhookUrl && !isDryRun) {
      try {
        await sendDiscordNotification(discordWebhookUrl, {
          content: `🚨 Workers のエラー監視が止まった: ${error instanceof Error ? error.message : String(error)}`,
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
    .name('workers-error-alert')
    .description(
      [
        'Workers の失敗数を Cloudflare の GraphQL から取り、1 件でもあれば Discord に警告します。',
        '--summary を付けると失敗が無くても件数を1行投稿します。',
      ].join('\n'),
    )
    .option(
      '--hours <N>',
      `さかのぼる時間 (default: ${DEFAULT_WINDOW_HOURS})`,
      parseHours,
      DEFAULT_WINDOW_HOURS,
    )
    .option('--summary', '失敗が無くても件数を Discord に投稿する', false)
    .option('--dry-run', '取得と判定だけ行い、Discord には投稿しない', false)
    .addHelpText(
      'after',
      `
Environment variables:
  CLOUDFLARE_API_TOKEN    Cloudflare API トークン (権限: Account Analytics:Read)
  CLOUDFLARE_ACCOUNT_ID   アカウント ID (default: ${DEFAULT_ACCOUNT_ID})
  DISCORD_WEBHOOK_URL     Discord webhook URL (通知先)
`,
    )
    .action(main);
}
