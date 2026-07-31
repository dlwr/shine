import {describe, expect, it} from 'vitest';
import {findBestFilmCategory, normalizeCategoryName} from './best-film-category';
import type {AwardsCategory} from './types';

const category = (
  uid: string,
  name: string,
  organizationUid = 'org-1',
): AwardsCategory => ({uid, name, organizationUid});

describe('normalizeCategoryName', () => {
  it('全角括弧を半角に正規化する', () => {
    expect(normalizeCategoryName('作品賞（最優秀作品）')).toBe(
      '作品賞(最優秀作品)',
    );
  });

  it('大文字を小文字に正規化する', () => {
    expect(normalizeCategoryName('Best Picture')).toBe('best picture');
  });

  it('連続する空白を1つにまとめる', () => {
    expect(normalizeCategoryName('best   film')).toBe('best film');
  });
});

describe('findBestFilmCategory', () => {
  it('作品賞に完全一致するカテゴリを返す', () => {
    const categories = [
      category('cat-1', '監督賞'),
      category('cat-2', '作品賞'),
    ];

    expect(findBestFilmCategory(categories, 'org-1')?.uid).toBe('cat-2');
  });

  it('英語のBest Pictureにも一致する', () => {
    const categories = [
      category('cat-1', 'Best Director'),
      category('cat-2', 'Best Picture'),
    ];

    expect(findBestFilmCategory(categories, 'org-1')?.uid).toBe('cat-2');
  });

  it('別organizationのカテゴリは対象にしない', () => {
    const categories = [category('cat-1', '作品賞', 'org-2')];

    expect(findBestFilmCategory(categories, 'org-1')).toBeUndefined();
  });

  it('organizationUidが空の場合はundefinedを返す', () => {
    const categories = [category('cat-1', '作品賞')];

    expect(findBestFilmCategory(categories, '')).toBeUndefined();
  });

  it('完全一致がない場合は部分一致で最も近いカテゴリを返す', () => {
    const categories = [
      category('cat-1', '主演男優賞'),
      category('cat-2', 'アニメ作品賞'),
    ];

    expect(findBestFilmCategory(categories, 'org-1')?.uid).toBe('cat-2');
  });
});
