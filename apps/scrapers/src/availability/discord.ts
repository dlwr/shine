import type {SelectionCheckSummary} from './ensure-selection';
import type {FetchLike} from './types';

const typeLabels = {
  daily: '明日の映画',
  weekly: '来週の映画',
  monthly: '来月の映画',
} as const;

export type DiscordMessage = {
  content: string;
  embeds: Array<{
    title: string;
    description: string;
    color: number;
  }>;
};

const COLOR_OK = 0x2e_cc_71;
const COLOR_WARNING = 0xe6_7e_22;

function describeSummary(summary: SelectionCheckSummary): string {
  const lines: string[] = [];
  const lastAttempt = summary.attempts.at(-1);
  const okSources = (lastAttempt?.results ?? []).filter(
    result => result.status === 'ok',
  );

  lines.push(
    summary.exhausted
      ? `⚠️ ${summary.attempts.length}本チェックして視聴可能な映画が見つからず、最後の候補を採用`
      : `視聴可否: OK (${okSources.map(r => `${r.source}: ${r.detail ?? 'ok'}`).join(' / ')})`,
  );

  if (summary.attempts.length > 1) {
    lines.push(`再抽選: ${summary.attempts.length - 1}回`);
    for (const attempt of summary.attempts.slice(0, -1)) {
      lines.push(`  ✕ ${attempt.title}`);
    }
  }

  const errors = summary.attempts
    .flatMap(attempt => attempt.results)
    .filter(result => result.status === 'error');
  if (errors.length > 0) {
    const sources = [...new Set(errors.map(error => error.source))];
    lines.push(
      `⚠️ ソースエラー: ${sources
        .map(source => {
          const detail = errors.find(error => error.source === source)?.detail;
          return detail ? `${source} (${detail})` : source;
        })
        .join(', ')}`,
    );
  }

  return lines.join('\n');
}

export function buildDiscordMessage(
  summaries: SelectionCheckSummary[],
  date: string,
): DiscordMessage {
  const hasWarning = summaries.some(
    summary =>
      summary.exhausted ||
      summary.attempts.some(attempt =>
        attempt.results.some(result => result.status === 'error'),
      ),
  );

  return {
    content: `🎬 セレクション可用性チェック (${date})${hasWarning ? ' — ⚠️ 要確認' : ''}`,
    embeds: summaries.map(summary => ({
      title: `${typeLabels[summary.type]}${summary.date ? ` (${summary.date})` : ''}: ${summary.finalMovie.title}`,
      description: describeSummary(summary),
      color: summary.exhausted ? COLOR_WARNING : COLOR_OK,
    })),
  };
}

export async function sendDiscordNotification(
  webhookUrl: string,
  message: DiscordMessage,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed: HTTP ${response.status}`);
  }
}
