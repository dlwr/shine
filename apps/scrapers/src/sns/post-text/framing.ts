const MAX_POST_LENGTH = 300;
const X_MAX_WEIGHTED_LENGTH = 280;
const X_URL_WEIGHT = 23;

export const HASHTAG = '#青空映画部';

export function formatTitle(title: string, year?: number): string {
  return `『${title}』${year ? `(${year})` : ''}`;
}

export function bareUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

export function withHashtag(body: string): string {
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

export function withBareUrl(body: string, url: string): string {
  const urlWeight = Math.max(X_URL_WEIGHT, xWeightedLength(bareUrl(url)));
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

  return `${truncatedBody}\n${bareUrl(url)}`;
}
