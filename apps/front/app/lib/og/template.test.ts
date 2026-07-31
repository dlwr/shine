import {describe, expect, it} from 'vitest';
import {
  buildBannerHtml,
  buildHomeCardHtml,
  buildMovieCardHtml,
  escapeHtml,
  splitYear,
  titleFontSize,
} from './template';

describe('escapeHtml', () => {
  it('タグに使われる文字をエスケープする', () => {
    expect(escapeHtml('<b>&"\'')).toBe('&lt;b&gt;&amp;&quot;&#39;');
  });

  it('日本語はそのまま通す', () => {
    expect(escapeHtml('ランド・オブ・ザ・デッド')).toBe(
      'ランド・オブ・ザ・デッド',
    );
  });
});

describe('splitYear', () => {
  it('年を前2桁と後2桁に分ける', () => {
    expect(splitYear(2005)).toEqual({head: '20', tail: '05'});
  });

  it('年が無ければundefinedを返す', () => {
    expect(splitYear()).toBeUndefined();
  });
});

describe('titleFontSize', () => {
  it('短いタイトルは大きく表示する', () => {
    expect(titleFontSize('エレクション')).toBe(72);
  });

  it('長いタイトルは段階的に縮める', () => {
    expect(titleFontSize('a'.repeat(25))).toBeLessThan(72);
  });

  it('非常に長いタイトルでも下限を割らない', () => {
    expect(titleFontSize('a'.repeat(200))).toBeGreaterThanOrEqual(36);
  });
});

describe('buildMovieCardHtml', () => {
  const baseProperties = {
    title: 'ランド・オブ・ザ・デッド',
    originalTitle: 'Land of the Dead',
    year: 2005,
    posterDataUri: 'data:image/jpeg;base64,abc',
    organizations: ['POPEYE'],
    availabilityLabels: ['U-NEXT 見放題'],
  };

  it('タイトルを含む', () => {
    expect(buildMovieCardHtml(baseProperties)).toContain(
      'ランド・オブ・ザ・デッド',
    );
  });

  it('タイトルのHTML特殊文字をエスケープする', () => {
    const html = buildMovieCardHtml({
      ...baseProperties,
      title: '<script>alert(1)</script>',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('ポスターをdata URIで埋め込む', () => {
    expect(buildMovieCardHtml(baseProperties)).toContain(
      'data:image/jpeg;base64,abc',
    );
  });

  it('ポスターが無ければimgタグを出さない', () => {
    const html = buildMovieCardHtml({
      ...baseProperties,
      posterDataUri: undefined,
    });

    expect(html).not.toContain('<img');
  });

  it('可用性ラベルを含む', () => {
    expect(buildMovieCardHtml(baseProperties)).toContain('U-NEXT 見放題');
  });

  it('選出団体を含む', () => {
    expect(buildMovieCardHtml(baseProperties)).toContain('POPEYE');
  });

  it('原題が邦題と同じ場合は重複表示しない', () => {
    const html = buildMovieCardHtml({
      ...baseProperties,
      title: 'Election',
      originalTitle: 'Election',
    });

    expect(html.split('Election').length - 1).toBe(1);
  });
});

describe('buildHomeCardHtml', () => {
  it('SHINEのロゴタイトルを含む', () => {
    expect(buildHomeCardHtml()).toContain('SHINE');
  });

  it('日本語のタグラインを含む', () => {
    expect(buildHomeCardHtml()).toContain('毎日1本、埋もれた映画に光を当てる');
  });
});

describe('buildBannerHtml', () => {
  it('SHINEのロゴタイトルを含む', () => {
    expect(buildBannerHtml()).toContain('SHINE');
  });

  it('日本語のタグラインを含む', () => {
    expect(buildBannerHtml()).toContain('毎日1本、埋もれた映画に光を当てる');
  });
});
