const namedReferences: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  bull: '•',
  middot: '·',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  lrm: '‎',
  rlm: '‏',
};

const decodeCodePoint = (reference: string, codePoint: number) =>
  Number.isSafeInteger(codePoint) && codePoint > 0 && codePoint <= 0x10_ff_ff
    ? String.fromCodePoint(codePoint)
    : reference;

export function decodeHtmlText(text: string): string {
  return text
    .replaceAll(
      /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
      (reference, decimal?: string, hex?: string, name?: string) => {
        if (decimal) {
          return decodeCodePoint(reference, Number(decimal));
        }

        if (hex) {
          return decodeCodePoint(reference, Number.parseInt(hex, 16));
        }

        return namedReferences[name!.toLowerCase()] ?? reference;
      },
    )
    .replaceAll(/[‎‏]/g, '')
    .trim();
}
