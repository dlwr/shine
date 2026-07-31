import {describe, expect, it} from 'vitest';
import {buildAvailabilityLabels} from './availability-labels';

describe('buildAvailabilityLabels', () => {
  it('tmdbの見放題サービスをラベルにする', () => {
    const labels = buildAvailabilityLabels([
      {source: 'tmdb', detail: 'U-NEXT(見放題), Amazon Video(レンタル)'},
    ]);

    expect(labels).toContain('U-NEXT 見放題');
  });

  it('見放題が無くレンタルのみなら「レンタル配信あり」', () => {
    const labels = buildAvailabilityLabels([
      {source: 'tmdb', detail: 'Amazon Video(レンタル), Apple TV Store(購入)'},
    ]);

    expect(labels).toEqual(['レンタル配信あり']);
  });

  it('discasソースがあれば宅配レンタルを足す', () => {
    const labels = buildAvailabilityLabels([{source: 'discas'}]);

    expect(labels).toContain('宅配レンタル');
  });

  it('unextソースは見放題サービスと重複しなければ足す', () => {
    expect(buildAvailabilityLabels([{source: 'unext'}])).toContain('U-NEXT');
    expect(
      buildAvailabilityLabels([
        {source: 'tmdb', detail: 'U-NEXT(見放題)'},
        {source: 'unext'},
      ]),
    ).toEqual(['U-NEXT 見放題']);
  });

  it('同じ見放題サービスの重複を除く', () => {
    const labels = buildAvailabilityLabels([
      {source: 'tmdb', detail: 'U-NEXT(見放題), U-NEXT(見放題)'},
    ]);

    expect(labels).toEqual(['U-NEXT 見放題']);
  });

  it('availabilityが空なら空配列', () => {
    expect(buildAvailabilityLabels([])).toEqual([]);
  });
});
