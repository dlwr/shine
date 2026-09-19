import {withBareUrl, withHashtag} from './framing';
import {buildSelectionLines, type SelectionPostInput} from './selection';

type DailyPostInput = SelectionPostInput & {
  monthlyTitle?: string;
};

function buildBodyLines(input: DailyPostInput): string {
  const lines = buildSelectionLines('今日の1本', input);

  if (input.monthlyTitle) {
    lines.push(`今月の1本は『${input.monthlyTitle}』`);
  }

  return lines.join('\n');
}

export function buildDailyPostText(input: DailyPostInput): string {
  return withHashtag(buildBodyLines(input));
}

export function buildXPostText(input: DailyPostInput & {url: string}): string {
  return withBareUrl(buildBodyLines(input), input.url);
}
