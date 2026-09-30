import {InvalidArgumentError} from 'commander';
import {describe, expect, it} from 'vitest';
import {integerAtLeast, oneOf} from '../cli-options';

describe('integerAtLeast', () => {
  const parseYear = integerAtLeast(1946, 'year');

  it('下限ちょうどの整数を数値で返す', () => {
    expect(parseYear('1946')).toBe(1946);
  });

  it('下限を下回る値は下限つきの文言で弾く', () => {
    expect(() => parseYear('1945')).toThrow(
      new InvalidArgumentError('yearは1946以上の整数で指定してください。'),
    );
  });

  it('小数は弾く', () => {
    expect(() => parseYear('1990.5')).toThrow(InvalidArgumentError);
  });

  it('数値でない文字列は弾く', () => {
    expect(() => parseYear('abc')).toThrow(InvalidArgumentError);
  });
});

describe('oneOf', () => {
  const parseCategory = oneOf(['Best Director', 'Best Actor'], 'category');

  it('候補にある値をそのまま返す', () => {
    expect(parseCategory('Best Actor')).toBe('Best Actor');
  });

  it('候補にない値は候補を並べた文言で弾く', () => {
    expect(() => parseCategory('Best Picture')).toThrow(
      new InvalidArgumentError(
        'categoryは次のいずれかで指定してください: Best Director / Best Actor',
      ),
    );
  });
});
