import {describe, expect, it} from 'vitest';
import {buildSocialMeta, upgradePosterForSharing} from './meta';

const baseInput = {
  title: 'テストタイトル',
  description: 'テスト説明',
  path: '/movies/abc',
  locale: 'ja',
} as const;

describe('buildSocialMeta', () => {
  it('titleを返す', () => {
    expect(buildSocialMeta(baseInput)).toContainEqual({
      title: 'テストタイトル',
    });
  });

  it('descriptionを返す', () => {
    expect(buildSocialMeta(baseInput)).toContainEqual({
      name: 'description',
      content: 'テスト説明',
    });
  });

  it('og:titleを返す', () => {
    expect(buildSocialMeta(baseInput)).toContainEqual({
      property: 'og:title',
      content: 'テストタイトル',
    });
  });

  it('og:descriptionを返す', () => {
    expect(buildSocialMeta(baseInput)).toContainEqual({
      property: 'og:description',
      content: 'テスト説明',
    });
  });

  it('og:urlをサイトの絶対URLで返す', () => {
    expect(buildSocialMeta(baseInput)).toContainEqual({
      property: 'og:url',
      content: 'https://shine-film.com/movies/abc',
    });
  });

  it('og:site_nameを返す', () => {
    expect(buildSocialMeta(baseInput)).toContainEqual({
      property: 'og:site_name',
      content: 'SHINE',
    });
  });

  it('og:typeは既定でwebsiteになる', () => {
    expect(buildSocialMeta(baseInput)).toContainEqual({
      property: 'og:type',
      content: 'website',
    });
  });

  it('og:typeにarticleを指定できる', () => {
    expect(buildSocialMeta({...baseInput, type: 'article'})).toContainEqual({
      property: 'og:type',
      content: 'article',
    });
  });

  it('localeがjaならog:localeはja_JPになる', () => {
    expect(buildSocialMeta(baseInput)).toContainEqual({
      property: 'og:locale',
      content: 'ja_JP',
    });
  });

  it('localeがenならog:localeはen_USになる', () => {
    expect(buildSocialMeta({...baseInput, locale: 'en'})).toContainEqual({
      property: 'og:locale',
      content: 'en_US',
    });
  });

  it('imageUrlを渡すとog:imageを返す', () => {
    const result = buildSocialMeta({
      ...baseInput,
      imageUrl: 'https://image.tmdb.org/t/p/w780/poster.jpg',
    });

    expect(result).toContainEqual({
      property: 'og:image',
      content: 'https://image.tmdb.org/t/p/w780/poster.jpg',
    });
  });

  it('imageUrlがなければog:imageを含まない', () => {
    const result = buildSocialMeta(baseInput);

    expect(result).not.toContainEqual(
      expect.objectContaining({property: 'og:image'}),
    );
  });

  it('twitter:cardを返す', () => {
    expect(buildSocialMeta(baseInput)).toContainEqual({
      name: 'twitter:card',
      content: 'summary',
    });
  });

  it('largeImage指定時はtwitter:cardがsummary_large_imageになる', () => {
    const result = buildSocialMeta({
      ...baseInput,
      imageUrl: 'https://shine-film.com/og/movie.png?id=abc',
      largeImage: true,
    });

    expect(result).toContainEqual({
      name: 'twitter:card',
      content: 'summary_large_image',
    });
  });

  it('largeImage指定時はog:imageの寸法を返す', () => {
    const result = buildSocialMeta({
      ...baseInput,
      imageUrl: 'https://shine-film.com/og/movie.png?id=abc',
      largeImage: true,
    });

    expect(result).toContainEqual({
      property: 'og:image:width',
      content: '1200',
    });
    expect(result).toContainEqual({
      property: 'og:image:height',
      content: '630',
    });
  });

  it('imageUrlが無ければlargeImageを指定してもsummaryのまま', () => {
    expect(buildSocialMeta({...baseInput, largeImage: true})).toContainEqual({
      name: 'twitter:card',
      content: 'summary',
    });
  });

  it('canonicalリンクにできるようog:urlはpathの先頭スラッシュ有無に依存しない', () => {
    expect(buildSocialMeta({...baseInput, path: 'movies/abc'})).toContainEqual({
      property: 'og:url',
      content: 'https://shine-film.com/movies/abc',
    });
  });
});

describe('upgradePosterForSharing', () => {
  it('w500のTMDbポスターURLをw780へ書き換える', () => {
    expect(
      upgradePosterForSharing('https://image.tmdb.org/t/p/w500/poster.jpg'),
    ).toBe('https://image.tmdb.org/t/p/w780/poster.jpg');
  });

  it('w342のTMDbポスターURLをw780へ書き換える', () => {
    expect(
      upgradePosterForSharing('https://image.tmdb.org/t/p/w342/poster.jpg'),
    ).toBe('https://image.tmdb.org/t/p/w780/poster.jpg');
  });

  it('originalサイズもw780へ落とす', () => {
    expect(
      upgradePosterForSharing('https://image.tmdb.org/t/p/original/poster.jpg'),
    ).toBe('https://image.tmdb.org/t/p/w780/poster.jpg');
  });

  it('TMDb以外のURLはそのまま返す', () => {
    expect(upgradePosterForSharing('https://example.com/poster.jpg')).toBe(
      'https://example.com/poster.jpg',
    );
  });

  it('undefinedを渡すとundefinedを返す', () => {
    expect(upgradePosterForSharing()).toBeUndefined();
  });
});
