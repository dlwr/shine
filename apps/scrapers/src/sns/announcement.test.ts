import {describe, expect, it} from 'vitest';
import {parseAnnouncement} from './announcement';

const valid = {
  text: '第83回ヴェネツィア国際映画祭が開催中。',
  url: 'https://shine-film.com/watched/venice-golden-lion',
  title: '金獅子賞受賞作、何本観た？ | SHINE',
  description: '歴代受賞作69本にチェックを付けて共有できます。',
  imageUrl: 'https://shine-film.com/og/watched.png?slug=venice-golden-lion',
};

describe('parseAnnouncement', () => {
  it('5つの項目をそのまま返す', () => {
    expect(parseAnnouncement(valid)).toEqual(valid);
  });

  it('項目が欠けていれば項目名を挙げて失敗する', () => {
    expect(() => parseAnnouncement({...valid, imageUrl: undefined})).toThrow(
      'imageUrl',
    );
  });

  it('空文字の項目も欠けている扱いにする', () => {
    expect(() => parseAnnouncement({...valid, text: ''})).toThrow('text');
  });

  it('オブジェクトでなければ失敗する', () => {
    expect(() => parseAnnouncement('text')).toThrow();
  });
});
