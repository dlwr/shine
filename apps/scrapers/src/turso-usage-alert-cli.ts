#!/usr/bin/env -S tsx

/**
 * Turso の読み取り量を Platform API から取り、閾値を超えていたら Discord に警告する。
 * --summary を付けると警告が無くても現在値を1行投稿する。
 */
import process from 'node:process';
import {sendDiscordNotification} from './availability/discord';
import {loadEnvironmentFiles} from './common/environment';
import {billingCycle, evaluateTursoUsage, fetchRowsRead} from './turso-usage';

loadEnvironmentFiles();

const DAY_MS = 86_400_000;

const arguments_ = new Set(process.argv.slice(2));
const isDryRun = arguments_.has('--dry-run');
const shouldPostSummary = arguments_.has('--summary');
const shouldHelp = arguments_.has('--help') || arguments_.has('-h');

async function main(): Promise<void> {
  const token = process.env.TURSO_PLATFORM_API_TOKEN || '';

  if (!token) {
    console.error('TURSO_PLATFORM_API_TOKEN が設定されていません');
    process.exitCode = 1;
    return;
  }

  const credentials = {
    token,
    organization: process.env.TURSO_ORGANIZATION || 'dlwr',
  };
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || '';

  try {
    const now = new Date();
    const {start} = billingCycle(now);
    const [last24hRowsRead, monthToDateRowsRead] = await Promise.all([
      fetchRowsRead(credentials, new Date(now.getTime() - DAY_MS), now),
      fetchRowsRead(credentials, start, now),
    ]);

    const {alerts, summary} = evaluateTursoUsage({
      last24hRowsRead,
      monthToDateRowsRead,
      now,
    });

    const content =
      alerts.length > 0
        ? [
            '⚠️ Turso の読み取りが多すぎる',
            ...alerts.map(alert => `- ${alert}`),
            summary,
          ].join('\n')
        : summary;

    console.log(content);

    if (isDryRun) {
      console.log('(dry-run: Discord通知はスキップ)');
      return;
    }

    if (!shouldPostSummary && alerts.length === 0) {
      return;
    }

    if (!discordWebhookUrl) {
      console.warn('DISCORD_WEBHOOK_URL 未設定のため通知をスキップ');
      return;
    }

    await sendDiscordNotification(discordWebhookUrl, {content, embeds: []});
  } catch (error) {
    console.error('Turso 利用量の取得に失敗しました:', error);
    if (discordWebhookUrl && !isDryRun) {
      try {
        await sendDiscordNotification(discordWebhookUrl, {
          content: `🚨 Turso 利用量チェックがエラーで停止: ${error instanceof Error ? error.message : String(error)}`,
          embeds: [],
        });
      } catch {
        // 通知自体の失敗はexit codeで拾う
      }
    }

    process.exitCode = 1;
  }
}

if (shouldHelp) {
  console.log(`
Usage: turso-usage-alert-cli [options]

Options:
  --summary      警告が無くても現在の読み取り量を Discord に投稿する
  --dry-run      取得と判定だけ行い、Discord には投稿しない
  --help         このヘルプを表示

Environment variables:
  TURSO_PLATFORM_API_TOKEN   Turso Platform API トークン (turso auth api-tokens mint)
  TURSO_ORGANIZATION         組織スラッグ (default: dlwr)
  DISCORD_WEBHOOK_URL        Discord webhook URL (通知先)
`);
} else {
  await main();
}
