import {formatTitle, withBareUrl, withHashtag} from './framing';
import {buildSelectionLines, type SelectionPostInput} from './selection';

function buildMonthlyBody(input: SelectionPostInput): string {
  return [
    ...buildSelectionLines('今月の1本', input),
    '今月はみんなでこれを観る。観たら感想や記事のリンクを映画ページに貼ってください。',
  ].join('\n');
}

export function buildMonthlyPostText(input: SelectionPostInput): string {
  return withHashtag(buildMonthlyBody(input));
}

export function buildMonthlyXPostText(
  input: SelectionPostInput & {url: string},
): string {
  return withBareUrl(buildMonthlyBody(input), input.url);
}

type MonthlyPreviewInput = SelectionPostInput & {startDate: string};

function buildMonthlyPreviewBody({
  startDate,
  ...input
}: MonthlyPreviewInput): string {
  const [, month, day] = startDate.split('-', 3);

  return [
    ...buildSelectionLines('来月の1本', input),
    `${Number(month)}月${Number(day)}日から、みんなでこれを観ます。観る手段を今のうちに。`,
  ].join('\n');
}

export function buildMonthlyPreviewPostText(
  input: MonthlyPreviewInput,
): string {
  return withHashtag(buildMonthlyPreviewBody(input));
}

export function buildMonthlyPreviewXPostText(
  input: MonthlyPreviewInput & {url: string},
): string {
  return withBareUrl(buildMonthlyPreviewBody(input), input.url);
}

type MonthlyReminderInput = {
  title: string;
  year?: number;
  availabilityLabels: string[];
  linkCount: number;
};

function buildMonthlyReminderBody({
  title,
  year,
  availabilityLabels,
  linkCount,
}: MonthlyReminderInput): string {
  const availabilityPart =
    availabilityLabels.length > 0 ? `▶ ${availabilityLabels.join(' / ')}` : '';
  const linksPart =
    linkCount > 0
      ? `観た人の記事・ポストが${linkCount}件集まっています。観たら映画ページにリンクを貼ってください。`
      : 'まだ記事・ポストはありません。最初の1件を貼ってください。';

  return [
    `今月の1本${formatTitle(title, year)}、もう観た？`,
    `今月は残り半分。${availabilityPart}`,
    linksPart,
  ].join('\n');
}

export function buildMonthlyReminderPostText(
  input: MonthlyReminderInput,
): string {
  return withHashtag(buildMonthlyReminderBody(input));
}

export function buildMonthlyReminderXPostText(
  input: MonthlyReminderInput & {url: string},
): string {
  return withBareUrl(buildMonthlyReminderBody(input), input.url);
}

type MonthlyLinksInput = {
  title: string;
  year?: number;
  count: number;
};

function buildMonthlyLinksBody({
  title,
  year,
  count,
}: MonthlyLinksInput): string {
  return [
    `今月の1本${formatTitle(title, year)}に、観た人の記事・ポストが${count}件付きました。`,
    '映画ページから読めます。観たら、ひとことでも書いてください。',
  ].join('\n');
}

export function buildMonthlyLinksPostText(input: MonthlyLinksInput): string {
  return withHashtag(buildMonthlyLinksBody(input));
}

export function buildMonthlyLinksXPostText(
  input: MonthlyLinksInput & {url: string},
): string {
  return withBareUrl(buildMonthlyLinksBody(input), input.url);
}

type MonthlyRoundupInput = {
  title: string;
  year?: number;
  linkCount: number;
  nextTitle?: string;
};

function buildMonthlyRoundupBody({
  title,
  year,
  linkCount,
  nextTitle,
}: MonthlyRoundupInput): string {
  const lines =
    linkCount > 0
      ? [
          `今月の1本${formatTitle(title, year)}、観た人の記事・ポストは${linkCount}件。`,
          '映画ページから読めます。',
        ]
      : [
          `今月の1本${formatTitle(title, year)}、観た人の記事・ポストはまだありません。`,
        ];

  if (nextTitle) {
    lines.push(`来月の1本は『${nextTitle}』。明日から。`);
  }

  return lines.join('\n');
}

export function buildMonthlyRoundupPostText(
  input: MonthlyRoundupInput,
): string {
  return withHashtag(buildMonthlyRoundupBody(input));
}

export function buildMonthlyRoundupXPostText(
  input: MonthlyRoundupInput & {url: string},
): string {
  return withBareUrl(buildMonthlyRoundupBody(input), input.url);
}
