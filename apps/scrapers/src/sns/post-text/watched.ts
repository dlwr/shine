import {HASHTAG, bareUrl} from './framing';

type WatchedPostInput = {
  heading: string;
  total: number;
};

function buildWatchedBody({heading, total}: WatchedPostInput): string {
  return [
    '今週の観た映画チェック',
    `${heading}の歴代受賞作${total}本、何本観た？`,
    'チェックを付けて結果を共有できます。',
  ].join('\n');
}

export function buildWatchedPostText(input: WatchedPostInput): string {
  return `${buildWatchedBody(input)}\n${HASHTAG}`;
}

export function buildWatchedXPostText(
  input: WatchedPostInput & {url: string},
): string {
  return `${buildWatchedBody(input)}\n${bareUrl(input.url)}`;
}
