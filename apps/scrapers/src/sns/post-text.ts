const MAX_ORGANIZATIONS = 2;
const MAX_POST_LENGTH = 300;
const HASHTAG = '#青空映画部';
const X_MAX_WEIGHTED_LENGTH = 280;
const X_URL_WEIGHT = 23;

type DailyPostInput = {
  title: string;
  year?: number;
  organizations: string[];
  availabilityLabels: string[];
};

function buildBodyLines({
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

  return lines.join('\n');
}

export function buildDailyPostText(input: DailyPostInput): string {
  const body = buildBodyLines(input);
  const maxBodyLength = MAX_POST_LENGTH - [...`\n${HASHTAG}`].length;
  const truncatedBody =
    [...body].length <= maxBodyLength
      ? body
      : [...body].slice(0, maxBodyLength - 1).join('') + '…';

  return `${truncatedBody}\n${HASHTAG}`;
}

export function xWeightedLength(text: string): number {
  let length = 0;
  for (const character of text) {
    length += character.codePointAt(0)! < 0x11_00 ? 1 : 2;
  }

  return length;
}

export function buildXPostText(input: DailyPostInput & {url: string}): string {
  const body = buildBodyLines(input);
  const bareUrl = input.url.replace(/^https?:\/\//, '');
  const urlWeight = Math.max(X_URL_WEIGHT, xWeightedLength(bareUrl));
  const maxBodyWeight = X_MAX_WEIGHTED_LENGTH - urlWeight - 1;

  let truncatedBody = body;
  if (xWeightedLength(body) > maxBodyWeight) {
    const characters = [...body];
    let weight = 2;
    let endIndex = 0;
    for (const [index, character] of characters.entries()) {
      const characterWeight = character.codePointAt(0)! < 0x11_00 ? 1 : 2;
      if (weight + characterWeight > maxBodyWeight) {
        break;
      }

      weight += characterWeight;
      endIndex = index + 1;
    }

    truncatedBody = characters.slice(0, endIndex).join('') + '…';
  }

  return `${truncatedBody}\n${bareUrl}`;
}
