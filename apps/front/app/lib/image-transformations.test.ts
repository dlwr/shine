import {describe, expect, it} from 'vitest';
import {transformedImageUrl} from './image-transformations';

describe('transformedImageUrl', () => {
  it('有効なら Image Transformations の経路を通す', () => {
    expect(
      transformedImageUrl('/quiz/poster.png?date=2026-09-13&stage=0', true),
    ).toBe(
      '/cdn-cgi/image/format=auto,quality=80/quiz/poster.png?date=2026-09-13&stage=0',
    );
  });

  it('無効ならそのまま返す', () => {
    expect(
      transformedImageUrl('/quiz/poster.png?date=2026-09-13&stage=0', false),
    ).toBe('/quiz/poster.png?date=2026-09-13&stage=0');
  });
});
