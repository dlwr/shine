import type {ShiritoriEntry} from '../types/shiritori';
import {simpleHash} from '../utils/hash';

const MAX_LINKS = 8;
const MIN_DAILY_LINKS = 6;
const MAX_START_ATTEMPTS = 20;

const LARGE_KANA: Record<string, string> = {
  ぁ: 'あ',
  ぃ: 'い',
  ぅ: 'う',
  ぇ: 'え',
  ぉ: 'お',
  っ: 'つ',
  ゃ: 'や',
  ゅ: 'ゆ',
  ょ: 'よ',
  ゎ: 'わ',
  ゕ: 'か',
  ゖ: 'け',
  ゐ: 'い',
  ゑ: 'え',
  を: 'お',
};

const VOWEL_ROWS = [
  'あかさたなはまやらわ',
  'いきしちにひみり',
  'うくすつぬふむゆる',
  'えけせてねへめれ',
  'おこそとのほもよろ',
];

const KATAKANA = /[ァ-ヶ]/;
const HIRAGANA = /^[ぁ-ん]$/;
const EDGE_SYMBOLS = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu;

function toHiragana(char: string): string {
  const hiragana = KATAKANA.test(char)
    ? String.fromCodePoint(char.codePointAt(0)! - 0x60)
    : char;
  return LARGE_KANA[hiragana] ?? hiragana;
}

function vowelOf(char: string): string | undefined {
  const row = VOWEL_ROWS.findIndex(kana => kana.includes(char));
  return row === -1 ? undefined : 'あいうえお'[row];
}

export function shiritoriEnds(
  title: string,
): {first: string; last: string} | undefined {
  const chars = [
    ...title
      .normalize('NFD')
      .replaceAll(/[゙゚]/g, '')
      .replaceAll(EDGE_SYMBOLS, ''),
  ].map(char => toHiragana(char));
  const first = chars[0];
  let end = chars.length - 1;
  while (end > 0 && chars[end] === 'ー') {
    end -= 1;
  }

  const last = end === chars.length - 1 ? chars[end] : vowelOf(chars[end]);
  if (!first || !last || !HIRAGANA.test(first) || !HIRAGANA.test(last)) {
    return undefined;
  }

  return {first, last};
}

function groupByFirst(
  entries: readonly ShiritoriEntry[],
): Map<string, ShiritoriEntry[]> {
  const byFirst = new Map<string, ShiritoriEntry[]>();
  for (const entry of entries) {
    byFirst.set(entry.first, [...(byFirst.get(entry.first) ?? []), entry]);
  }

  return byFirst;
}

export function buildChain(
  entries: readonly ShiritoriEntry[],
  startUid: string,
  seed: number,
): ShiritoriEntry[] {
  const start = entries.find(entry => entry.uid === startUid);
  if (!start) {
    return [];
  }

  const byFirst = groupByFirst(entries);
  const chain = [start];
  const used = new Set([start.uid]);
  const canContinue = (entry: ShiritoriEntry) =>
    entry.last !== 'ん' &&
    (byFirst.get(entry.last) ?? []).some(
      next => !used.has(next.uid) && next.uid !== entry.uid,
    );
  while (chain.length < MAX_LINKS && chain.at(-1)!.last !== 'ん') {
    const scored = (byFirst.get(chain.at(-1)!.last) ?? [])
      .filter(entry => !used.has(entry.uid))
      .map(entry => ({
        entry,
        score: (canContinue(entry) ? 2 : 0) + (entry.watchable ? 1 : 0),
      }));
    const best = Math.max(...scored.map(({score}) => score));
    const tier = scored.filter(({score}) => score === best);
    if (tier.length === 0) {
      break;
    }

    const {entry} = tier[simpleHash(`${seed}-${chain.length}`) % tier.length];
    chain.push(entry);
    used.add(entry.uid);
  }

  return chain;
}

export function pickDailyChain(
  entries: readonly ShiritoriEntry[],
  date: string,
): ShiritoriEntry[] {
  const byFirst = groupByFirst(entries);
  const starts = entries.filter(
    entry => entry.last !== 'ん' && byFirst.has(entry.last),
  );
  let longest: ShiritoriEntry[] = [];
  for (
    let attempt = 0;
    attempt < MAX_START_ATTEMPTS && starts.length > 0;
    attempt++
  ) {
    const start =
      starts[simpleHash(`shiritori-${date}-${attempt}`) % starts.length];
    const chain = buildChain(entries, start.uid, simpleHash(date));
    if (chain.length >= MIN_DAILY_LINKS) {
      return chain;
    }

    if (chain.length > longest.length) {
      longest = chain;
    }
  }

  return longest;
}
