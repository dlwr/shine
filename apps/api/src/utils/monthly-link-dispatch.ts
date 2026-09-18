import {classifySubmission, parseOriginRules} from '@shine/utils';
import type {ArticleLinkSubmission} from './article-link-notification';

const DISPATCH_URL = 'https://api.github.com/repos/dlwr/shine/dispatches';
const MONTHLY_LINK_EVENT_TYPE = 'monthly-link-posted';

type DispatchEnvironment = {
  GITHUB_DISPATCH_TOKEN?: string;
  NORTH_STAR_OWNER_URL_PREFIXES?: string;
  NORTH_STAR_OWNER_IPS?: string;
};

type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<{ok: boolean; status?: number}>;

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
    }
  } catch (error) {
    console.error('Error dispatching monthly link event:', error);
  }
}
