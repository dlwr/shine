import {describe, expect, it} from 'vitest';
import type {ShiritoriEntry} from '../../types/shiritori';
import {buildChain, pickDailyChain, shiritoriEnds} from '../shiritori';

function entry(
  uid: string,
  first: string,
  last: string,
  isWatchable = false,
): ShiritoriEntry {
  return {uid, title: uid, year: 2000, first, last, watchable: isWatchable};
}

describe('shiritoriEnds', () => {
  it('ひらがなの題名は最初と最後の字をそのまま使う', () => {
    expect(shiritoriEnds('となりのととろ')).toEqual({first: 'と', last: 'ろ'});
  });

  it('カタカナはひらがなに寄せる', () => {
    expect(shiritoriEnds('トトロ')).toEqual({first: 'と', last: 'ろ'});
  });

  it('濁点と半濁点は外す', () => {
    expect(shiritoriEnds('ゴジラ・パ')).toEqual({first: 'こ', last: 'は'});
  });

  it('小書き文字は大きくする', () => {
    expect(shiritoriEnds('ちいさなシャ')).toEqual({first: 'ち', last: 'や'});
  });

  it('長音は直前の字の母音にする', () => {
    expect(shiritoriEnds('グラディエーター')?.last).toBe('あ');
  });

  it('小書き文字に続く長音は小書き文字の母音にする', () => {
    expect(shiritoriEnds('アメリカン・ビューティー')?.last).toBe('い');
  });

  it('末尾の記号は読み飛ばす', () => {
    expect(shiritoriEnds('ガールズ＆パンツァー！')?.last).toBe('あ');
  });

  it('漢字で始まる題名は対象にしない', () => {
    expect(shiritoriEnds('七人の侍')).toBeUndefined();
  });

  it('漢字で終わる題名は対象にしない', () => {
    expect(shiritoriEnds('ローマの休日')).toBeUndefined();
  });

  it('を は お として扱う', () => {
    expect(shiritoriEnds('あいをヲ')?.last).toBe('お');
  });

  it('ヴ は う として扱う', () => {
    expect(shiritoriEnds('ヴぃ')?.first).toBe('う');
  });
});

describe('buildChain', () => {
  it('最後の字から始まる映画をつなぐ', () => {
    const entries = [entry('a', 'あ', 'い'), entry('b', 'い', 'う')];

    expect(buildChain(entries, 'a', 0).map(link => link.uid)).toEqual([
      'a',
      'b',
    ]);
  });

  it('同じ映画は二度使わない', () => {
    const entries = [entry('a', 'あ', 'あ'), entry('b', 'あ', 'い')];

    expect(buildChain(entries, 'a', 0).map(link => link.uid)).toEqual([
      'a',
      'b',
    ]);
  });

  it('ん で終わったらそこで止める', () => {
    const entries = [entry('a', 'あ', 'ん'), entry('b', 'ん', 'い')];

    expect(buildChain(entries, 'a', 0).map(link => link.uid)).toEqual(['a']);
  });

  it('8 本でやめる', () => {
    const entries = Array.from({length: 12}, (_, index) =>
      entry(`m${index}`, 'あ', 'あ'),
    );

    expect(buildChain(entries, 'm0', 0)).toHaveLength(8);
  });

  it('日本で観られる映画を優先する', () => {
    const entries = [
      entry('a', 'あ', 'い'),
      entry('b', 'い', 'う'),
      entry('c', 'い', 'う', true),
      entry('d', 'い', 'う'),
    ];

    expect(buildChain(entries, 'a', 0)[1].uid).toBe('c');
  });

  it('ん で終わる映画より続けられる映画を優先する', () => {
    const entries = [
      entry('a', 'あ', 'い'),
      entry('b', 'い', 'ん', true),
      entry('c', 'い', 'う'),
      entry('d', 'う', 'え'),
    ];

    expect(buildChain(entries, 'a', 0)[1].uid).toBe('c');
  });

  it('同じシードなら同じ鎖を返す', () => {
    const entries = Array.from({length: 20}, (_, index) =>
      entry(`m${index}`, 'あ', 'あ'),
    );

    expect(buildChain(entries, 'm0', 7)).toEqual(buildChain(entries, 'm0', 7));
  });

  it('無い映画からは始められない', () => {
    expect(buildChain([entry('a', 'あ', 'い')], 'missing', 0)).toEqual([]);
  });
});

describe('pickDailyChain', () => {
  it('6 本以上つながる鎖を選ぶ', () => {
    const entries = [
      entry('dead', 'か', 'き'),
      ...Array.from({length: 7}, (_, index) => entry(`m${index}`, 'あ', 'あ')),
    ];

    expect(pickDailyChain(entries, '2026-10-27').length).toBeGreaterThanOrEqual(
      6,
    );
  });

  it('同じ日なら同じ鎖を返す', () => {
    const entries = Array.from({length: 20}, (_, index) =>
      entry(`m${index}`, 'あ', 'あ'),
    );

    expect(pickDailyChain(entries, '2026-10-27')).toEqual(
      pickDailyChain(entries, '2026-10-27'),
    );
  });

  it('候補が無ければ空を返す', () => {
    expect(pickDailyChain([], '2026-10-27')).toEqual([]);
  });
});
