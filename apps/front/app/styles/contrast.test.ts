/// <reference types="node" />
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

function readTokens(selector: string): Record<string, string> {
  const css = readFileSync('apps/front/app/styles/tokens.css', 'utf8');
  const block = new RegExp(String.raw`${selector}\s*\{([^}]*)\}`).exec(
    css,
  )?.[1];

  return Object.fromEntries(
    (block ?? '')
      .matchAll(/--([a-z-]+):\s*(#[\da-f]{6});/gi)
      .map(match => [match[1], match[2]]),
  );
}

function relativeLuminance(hex: string): number {
  const channels = (hex.replace('#', '').match(/../g) ?? []).map(pair => {
    const value = Number.parseInt(pair, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = relativeLuminance(foreground);
  const darker = relativeLuminance(background);

  return (
    (Math.max(lighter, darker) + 0.05) / (Math.min(lighter, darker) + 0.05)
  );
}

const WCAG_AA_NORMAL_TEXT = 4.5;

const PAIRS = [
  ['ink', 'paper'],
  ['ink', 'surface'],
  ['ink-muted', 'paper'],
  ['ink-muted', 'surface'],
  ['brand', 'paper'],
  ['brand', 'surface'],
  ['brand-on', 'brand'],
] as const;

describe.each([
  ['light', ':root'],
  ['dark', String.raw`\.dark`],
])('%s の配色', (_theme, selector) => {
  it.each(PAIRS)(
    '%s を %s の上に置いて AA を満たす',
    (foreground, background) => {
      const tokens = readTokens(selector);

      expect(
        contrastRatio(tokens[foreground], tokens[background]),
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    },
  );
});
