const MAX_ORGANIZATIONS = 2;
const MAX_POST_LENGTH = 300;
const HASHTAG = '#青空映画部';

type DailyPostInput = {
  title: string;
  year?: number;
  organizations: string[];
  availabilityLabels: string[];
};

export function buildDailyPostText({
  title,
  year,
  organizations,
  availabilityLabels,
}: DailyPostInput): string {
  const yearPart = year ? `(${year})` : '';
  const lines = [`今日の1本 —『${title}』${yearPart}`];

  if (organizations.length > 0) {
    lines.push(`${organizations.slice(0, MAX_ORGANIZATIONS).join('・')} 選出`);
  }

  if (availabilityLabels.length > 0) {
    lines.push(`▶ ${availabilityLabels.join(' / ')}`);
  }

  const body = lines.join('\n');
  const maxBodyLength = MAX_POST_LENGTH - [...`\n${HASHTAG}`].length;
  const truncatedBody =
    [...body].length <= maxBodyLength
      ? body
      : [...body].slice(0, maxBodyLength - 1).join('') + '…';

  return `${truncatedBody}\n${HASHTAG}`;
}
