import {classifySubmission, parseOriginRules} from '@shine/utils';
import {
  SITE_URL,
  type ArticleLinkSubmission,
} from './article-link-notification';
import {postDiscordMessage, type FetchLike} from './discord';

const DISPATCH_URL = 'https://api.github.com/repos/dlwr/shine/dispatches';
const MONTHLY_LINK_EVENT_TYPE = 'monthly-link-posted';

type DispatchEnvironment = {
  GITHUB_DISPATCH_TOKEN?: string;
  DISCORD_WEBHOOK_URL?: string;
  NORTH_STAR_OWNER_URL_PREFIXES?: string;
  NORTH_STAR_OWNER_IPS?: string;
};

function buildFailureMessage(
  submission: ArticleLinkSubmission,
  reason: string,
): string {
  return [
    `⚠️ 『${submission.movieTitle ?? submission.movieUid}』に付いたリンクを bot に伝えられませんでした（${reason}）`,
    'トークンが切れていると即時の紹介が止まります。翌日 12:00 JST の定期実行では拾われます。',
    `${SITE_URL}/movies/${submission.movieUid}#article-links`,
  ].join('\n');
}

export async function dispatchMonthlyLinkPosted(
  environment: DispatchEnvironment,
  submission: ArticleLinkSubmission,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const token = environment.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return;
  }

  if (
    classifySubmission(submission, parseOriginRules(environment)) !== 'other'
  ) {
    return;
  }

  let failure: string | undefined;

  try {
    const response = await fetchImpl(DISPATCH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'shine-api',
      },
      body: JSON.stringify({
        event_type: MONTHLY_LINK_EVENT_TYPE,
        client_payload: {movieUid: submission.movieUid},
      }),
    });

    if (!response.ok) {
      console.error('GitHub dispatch failed', response.status);
      failure = `GitHub dispatch ${response.status}`;
    }
  } catch (error) {
    console.error('Error dispatching monthly link event:', error);
    failure = error instanceof Error ? error.message : String(error);
  }

  if (failure) {
    await postDiscordMessage(
      environment.DISCORD_WEBHOOK_URL,
      buildFailureMessage(submission, failure),
      fetchImpl,
    );
  }
}
