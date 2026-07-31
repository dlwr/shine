const MAX_ORGANIZATIONS = 2;
const MAX_POST_LENGTH = 300;

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

  const text = lines.join('\n');
  return [...text].length <= MAX_POST_LENGTH
    ? text
    : [...text].slice(0, MAX_POST_LENGTH - 1).join('') + '…';
}
