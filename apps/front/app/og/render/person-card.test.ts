import {describe, expect, it} from 'vitest';
import {pickRepresentativeTitles} from './person-card';

const LEGEND = [
  {slug: 'palme-dor', grouping: 'year' as const},
  {slug: 'venice-golden-lion', grouping: 'year' as const},
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

  it('受賞数の多い作品を先に選ぶ', () => {
    const titles = pickRepresentativeTitles(
      [
        {title: '1冠', awards: [{slug: 'palme-dor', isWinner: true}]},
        {
          title: '2冠',
          awards: [
            {slug: 'palme-dor', isWinner: true},
            {slug: 'venice-golden-lion', isWinner: true},
          ],
        },
      ],
      LEGEND,
    );

    expect(titles[0]).toBe('2冠');
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

  it('本人が受けた個人賞の受賞作を最優先で選ぶ', () => {
    const titles = pickRepresentativeTitles(
      [
        {
          title: '作品賞受賞作',
          awards: [{slug: 'palme-dor', isWinner: true}],
        },
        {
          title: '個人賞受賞作',
          awards: [],
          personAwards: [{isWinner: true}],
        },
      ],
      LEGEND,
    );

    expect(titles[0]).toBe('個人賞受賞作');
  });

  it('個人賞のノミネートも作品賞の受賞より優先する', () => {
    const titles = pickRepresentativeTitles(
      [
        {
          title: '作品賞受賞作',
          awards: [{slug: 'palme-dor', isWinner: true}],
        },
        {
          title: '個人賞候補作',
          awards: [],
          personAwards: [{isWinner: false}],
        },
      ],
      LEGEND,
    );

    expect(titles[0]).toBe('個人賞候補作');
  });
});
