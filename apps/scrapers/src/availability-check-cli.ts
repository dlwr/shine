#!/usr/bin/env -S tsx

/**
 * セレクション映画の可用性チェックCLI
 *
 * daily/weekly/monthlyのセレクション映画が配信・宅配レンタルで観られるかを
 * TMDb / U-NEXT / TSUTAYA DISCAS / GEO で確認し、観られなければ
 * APIの /reselect で再抽選する(上限10回)。結果はDiscordに通知する。
 */
import process from 'node:process';
import {
  buildDiscordMessage,
  sendDiscordNotification,
} from './availability/discord';
import {runAvailabilityCheck} from './availability/run';
import {buildEnvironment, loadEnvironmentFiles} from './common/environment';

loadEnvironmentFiles();

const arguments_ = new Set(process.argv.slice(2));
const isDryRun = arguments_.has('--dry-run');
const shouldHelp = arguments_.has('--help') || arguments_.has('-h');

async function main(): Promise<void> {
  const environment = buildEnvironment(process.env);

  const apiUrl =
    process.env.SHINE_API_URL || 'https://shine-api.yuta25.workers.dev';
  const adminPassword = environment.ADMIN_PASSWORD || '';
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || '';

  if (!environment.TURSO_DATABASE_URL || !environment.TURSO_AUTH_TOKEN) {
    console.error('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN が設定されていません');
    process.exitCode = 1;
    return;
  }

  if (!adminPassword) {
    console.error('ADMIN_PASSWORD が設定されていません');
    process.exitCode = 1;
    return;
  }

  try {
    const summaries = await runAvailabilityCheck({
      environment,
      apiUrl,
      adminPassword,
      maxAttempts: isDryRun ? 1 : 10,
    });

    const date = new Date().toISOString().slice(0, 10);
    const message = buildDiscordMessage(summaries, date);

    console.log(message.content);
    for (const embed of message.embeds) {
      console.log(`\n## ${embed.title}\n${embed.description}`);
    }

    if (isDryRun) {
      console.log('\n(dry-run: 再抽選・Discord通知はスキップ)');
    } else if (discordWebhookUrl) {
      await sendDiscordNotification(discordWebhookUrl, message);
    } else {
      console.warn('DISCORD_WEBHOOK_URL 未設定のため通知をスキップ');
    }

    const exhausted = summaries.filter(summary => summary.exhausted);
    if (exhausted.length > 0 && !isDryRun) {
      console.error(
        `視聴可能な映画が見つからなかったセレクション: ${exhausted
          .map(summary => summary.type)
          .join(', ')}`,
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('可用性チェックが失敗しました:', error);
    if (discordWebhookUrl && !isDryRun) {
      try {
        await sendDiscordNotification(discordWebhookUrl, {
          content: `🚨 セレクション可用性チェックがエラーで停止: ${error instanceof Error ? error.message : String(error)}`,
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
Usage: availability-check-cli [options]

Options:
  --dry-run      チェックのみ実行し、再抽選もDiscord通知もしない
  --help         このヘルプを表示

Environment variables:
  TURSO_DATABASE_URL     TursoデータベースURL
  TURSO_AUTH_TOKEN       Turso認証トークン
  TMDB_API_KEY           TMDb APIキー
  ADMIN_PASSWORD         API管理者パスワード
  SHINE_API_URL          APIのURL (default: https://shine-api.yuta25.workers.dev)
  DISCORD_WEBHOOK_URL    Discord webhook URL (通知先)
`);
} else {
  await main();
}
