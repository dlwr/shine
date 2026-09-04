import {describe, expect, it} from 'vitest';
import {
  buildBannerHtml,
  buildHomeCardHtml,
  buildMovieCardHtml,
  buildPersonCardHtml,
  buildQuizCardHtml,
  buildWatchedCardHtml,
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
  it('サービス名のロゴタイトルを含む', () => {
    expect(buildHomeCardHtml()).toContain('なんか見る');
  });

  it('日本語のタグラインを含む', () => {
    expect(buildHomeCardHtml()).toContain('決められない日に、映画を1本');
  });
});

describe('buildQuizCardHtml', () => {
  const baseProperties = {
    date: '2026-08-16',
    poolSize: 1396,
    posterDataUri: 'data:image/jpeg;base64,abc',
  };

  it('クイズの見出しを含む', () => {
    expect(buildQuizCardHtml(baseProperties)).toContain('今日の映画クイズ');
  });

  it('出題日を含む', () => {
    expect(buildQuizCardHtml(baseProperties)).toContain('2026-08-16');
  });

  it('出題プールの本数を含む', () => {
    expect(buildQuizCardHtml(baseProperties)).toContain('1,396');
  });

  it('ポスターをdata URIで埋め込む', () => {
    expect(buildQuizCardHtml(baseProperties)).toContain(
      'data:image/jpeg;base64,abc',
    );
  });

  it('ポスターを切り出して表示する', () => {
    expect(buildQuizCardHtml(baseProperties)).toContain('overflow:hidden');
  });

  it('渡された焦点で切り出す(出題ページと同じ範囲にするため)', () => {
    const html = buildQuizCardHtml({
      ...baseProperties,
      focalX: 0,
      focalY: 0,
    });

    expect(html).toContain('left:0px;top:0px');
  });

  it('焦点が右下なら右下を切り出す', () => {
    const html = buildQuizCardHtml({
      ...baseProperties,
      focalX: 1,
      focalY: 1,
    });

    expect(html).not.toContain('left:0px;top:0px');
  });

  it('ポスターが無ければimgタグを出さない', () => {
    const html = buildQuizCardHtml({
      ...baseProperties,
      posterDataUri: undefined,
    });

    expect(html).not.toContain('<img');
  });

  it('ポスターが無くても見出しは出す', () => {
    const html = buildQuizCardHtml({
      ...baseProperties,
      posterDataUri: undefined,
    });

    expect(html).toContain('今日の映画クイズ');
  });
});

describe('buildBannerHtml', () => {
  it('サービス名のロゴタイトルを含む', () => {
    expect(buildBannerHtml()).toContain('なんか見る');
  });

  it('日本語のタグラインを含む', () => {
    expect(buildBannerHtml()).toContain('決められない日に、映画を1本');
  });
});

describe('buildPersonCardHtml', () => {
  const baseProperties = {
    name: 'クリント・イーストウッド',
    originalName: 'Clint Eastwood',
    filmCount: 21,
    topTitles: ['ハドソン川の奇跡', 'グラン・トリノ'],
    portraitDataUri: 'data:image/jpeg;base64,abc',
  };

  it('名前を含む', () => {
    expect(buildPersonCardHtml(baseProperties)).toContain(
      'クリント・イーストウッド',
    );
  });

  it('名前のHTML特殊文字をエスケープする', () => {
    const html = buildPersonCardHtml({
      ...baseProperties,
      name: '<script>alert(1)</script>',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('原語名が同じなら重複表示しない', () => {
    const html = buildPersonCardHtml({
      ...baseProperties,
      name: 'Clint Eastwood',
    });

    expect(html.split('Clint Eastwood').length - 1).toBe(1);
  });

  it('作品数を含む', () => {
    expect(buildPersonCardHtml(baseProperties)).toContain('21');
  });

  it('代表作を含む', () => {
    expect(buildPersonCardHtml(baseProperties)).toContain('ハドソン川の奇跡');
  });

  it('顔写真をdata URIで埋め込む', () => {
    expect(buildPersonCardHtml(baseProperties)).toContain(
      'data:image/jpeg;base64,abc',
    );
  });

  it('顔写真が無ければimgタグを出さない', () => {
    const html = buildPersonCardHtml({
      ...baseProperties,
      portraitDataUri: undefined,
    });

    expect(html).not.toContain('<img');
  });
});

describe('buildWatchedCardHtml', () => {
  const baseProperties = {
    organization: 'カンヌ国際映画祭',
    name: 'パルム・ドール',
    total: 5,
    count: 2,
    percent: 40,
    watchedFlags: [true, false, true, false, false],
  };

  it('団体名と賞名を別の行に出す', () => {
    const html = buildWatchedCardHtml(baseProperties);

    expect(html).toContain('>カンヌ国際映画祭<');
    expect(html).toContain('>パルム・ドール<');
  });

  it('団体名と賞名が同じなら1行にする', () => {
    const html = buildWatchedCardHtml({
      ...baseProperties,
      organization: 'パルム・ドール',
    });

    expect(html.match(/パルム・ドール/g)).toHaveLength(1);
  });

  it('観た本数と総数と割合を含む', () => {
    const html = buildWatchedCardHtml(baseProperties);

    expect(html).toContain('>2<');
    expect(html).toContain('/ 5');
    expect(html).toContain('40%');
  });

  it('1本につき1マス描き、観たマスだけ塗る', () => {
    const html = buildWatchedCardHtml(baseProperties);

    expect(html.match(/data-cell="watched"/g)).toHaveLength(2);
    expect(html.match(/data-cell="unwatched"/g)).toHaveLength(3);
  });

  it('本数が増えると列数を増やしてマスを小さくする', () => {
    const small = buildWatchedCardHtml(baseProperties);
    const large = buildWatchedCardHtml({
      ...baseProperties,
      total: 99,
      count: 0,
      percent: 0,
      watchedFlags: Array.from({length: 99}, () => false),
    });

    expect(watchedCellSize(small)).toBeGreaterThan(watchedCellSize(large));
  });

  it('見出しをエスケープする', () => {
    expect(buildWatchedCardHtml({...baseProperties, name: 'A & B'})).toContain(
      'A &amp; B',
    );
  });
});

function watchedCellSize(html: string): number {
  return Number(/data-cell="[a-z]+" style="[^"]*width:(\d+)px/.exec(html)?.[1]);
}
