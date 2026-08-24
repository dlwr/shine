import {describe, expect, it} from 'vitest';
import {pickRepresentativeTitles} from './person-card';

const LEGEND = [
  {slug: 'palme-dor', grouping: 'year' as const},
  {slug: '1001-movies', grouping: 'list' as const},
];

describe('pickRepresentativeTitles', () => {
  it('年度制の賞の受賞作を先に選ぶ', () => {
    const titles = pickRepresentativeTitles(
      [
        {title: '新作', awards: []},
        {title: '受賞作', awards: [{slug: 'palme-dor', isWinner: true}]},
      ],
      LEGEND,
    );

    expect(titles[0]).toBe('受賞作');
  });

  it('受賞作の次にノミネート作を選ぶ', () => {
    const titles = pickRepresentativeTitles(
      [
        {title: '新作', awards: []},
        {title: 'ノミネート作', awards: [{slug: 'palme-dor', isWinner: false}]},
      ],
      LEGEND,
    );

    expect(titles[0]).toBe('ノミネート作');
  });

  it('リスト型の賞は受賞として扱わない', () => {
    const titles = pickRepresentativeTitles(
      [
        {title: '新作', awards: []},
        {title: 'リスト作', awards: [{slug: '1001-movies', isWinner: true}]},
      ],
      LEGEND,
    );

    expect(titles[0]).toBe('新作');
  });

  it('同じ格なら渡された順を保つ', () => {
    const titles = pickRepresentativeTitles(
      [
        {title: '新しい受賞作', awards: [{slug: 'palme-dor', isWinner: true}]},
        {title: '古い受賞作', awards: [{slug: 'palme-dor', isWinner: true}]},
      ],
      LEGEND,
    );

    expect(titles).toEqual(['新しい受賞作', '古い受賞作']);
  });

  it('2件までに絞る', () => {
    const titles = pickRepresentativeTitles(
      [
        {title: 'A', awards: []},
        {title: 'B', awards: []},
        {title: 'C', awards: []},
      ],
      LEGEND,
    );

    expect(titles).toEqual(['A', 'B']);
  });

  it('タイトルの無い作品は選ばない', () => {
    const titles = pickRepresentativeTitles(
      [
        {awards: [{slug: 'palme-dor', isWinner: true}]},
        {title: 'B', awards: []},
      ],
      LEGEND,
    );

    expect(titles).toEqual(['B']);
  });
});
