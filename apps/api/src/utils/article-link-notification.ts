import {classifySubmission, parseOriginRules} from '@shine/utils';
import {postDiscordMessage, type FetchLike} from './discord';

export const SITE_URL = 'https://shine-film.com';

export type ArticleLinkSubmission = {
  movieUid: string;
  movieTitle?: string;
  url?: string;
  title?: string;
  description?: string;
  submitterIp?: string;
  isOwnerSubmission?: boolean;
};

type NotificationEnvironment = {
  DISCORD_WEBHOOK_URL?: string;
  NORTH_STAR_OWNER_URL_PREFIXES?: string;
  NORTH_STAR_OWNER_IPS?: string;
};

function buildArticleLinkMessage(
  submission: ArticleLinkSubmission,
  origin: 'owner' | 'other',
): string {
  const who = origin === 'owner' ? '本人' : '他人';
  const lines = [
    `📝 『${submission.movieTitle ?? submission.movieUid}』に${who}の投稿が付きました`,
    `${SITE_URL}/movies/${submission.movieUid}#article-links`,
  ];

  if (submission.description) {
    lines.push(`ひとこと: ${submission.description}`);
  }

  if (submission.url) {
    lines.push(`リンク: ${submission.title ?? ''} ${submission.url}`.trim());
  }

  return lines.join('\n');
}

export async function notifyArticleLinkSubmission(
  environment: NotificationEnvironment,
  submission: ArticleLinkSubmission,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const origin = classifySubmission(submission, parseOriginRules(environment));
  if (origin === 'test') {
    return;
  }

  await postDiscordMessage(
    environment.DISCORD_WEBHOOK_URL,
    buildArticleLinkMessage(submission, origin),
    fetchImpl,
  );
}
