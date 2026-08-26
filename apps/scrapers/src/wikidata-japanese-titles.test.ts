import {describe, expect, it} from 'vitest';
import {
  cleanWikidataLabel,
  isSameTitle,
  parseSparqlResponse,
} from './wikidata-japanese-titles';

describe('cleanWikidataLabel', () => {
  it('「(映画)」の曖昧さ回避を落とす', () => {
    expect(cleanWikidataLabel('羅生門 (映画)')).toBe('羅生門');
  });

  it('「(1986年の映画)」の曖昧さ回避を落とす', () => {
    expect(cleanWikidataLabel('ザ・フライ (1986年の映画)')).toBe('ザ・フライ');
  });

  it('映画以外の半角括弧の曖昧さ回避も落とす', () => {
    expect(cleanWikidataLabel('家なき子 (1994年のテレビドラマ)')).toBe(
      '家なき子',
    );
  });

  it('作者名の曖昧さ回避を落とす', () => {
    expect(cleanWikidataLabel('鼠小僧次郎吉 (大佛次郎)')).toBe('鼠小僧次郎吉');
  });

  it('題名の途中にある括弧は残す', () => {
    expect(cleanWikidataLabel('(500)日のサマー')).toBe('(500)日のサマー');
  });

  it('括弧の無い題名はそのまま返す', () => {
    expect(cleanWikidataLabel('七人の侍')).toBe('七人の侍');
  });
});

describe('isSameTitle', () => {
  it('同じ文字列は同じ題名', () => {
    expect(isSameTitle('突破口！', '突破口！')).toBe(true);
  });

  it('全角と半角の記号の違いだけなら同じ題名', () => {
    expect(isSameTitle('突破口！', '突破口!')).toBe(true);
  });

  it('文字が違えば別の題名', () => {
    expect(isSameTitle('DEATH NOTE', 'デスノート')).toBe(false);
  });
});

const binding = (
  imdb: string,
  jaLabel: string | undefined,
  article?: string,
) => ({
  imdb: {value: imdb},
  ...(jaLabel !== undefined && {jaLabel: {value: jaLabel}}),
  ...(article !== undefined && {article: {value: article}}),
});

describe('parseSparqlResponse', () => {
  it('ja.wikipediaの記事名をラベルより優先する', () => {
    const titles = parseSparqlResponse({
      results: {
        bindings: [
          binding(
            'tt0000001',
            '壊れたラベル',
            'https://ja.wikipedia.org/wiki/%E7%BE%85%E7%94%9F%E9%96%80_(%E6%98%A0%E7%94%BB)',
          ),
        ],
      },
    });

    expect(titles.get('tt0000001')).toBe('羅生門');
  });

  it('記事が無ければラベルを使う', () => {
    const titles = parseSparqlResponse({
      results: {bindings: [binding('tt0000002', 'デスノート')]},
    });

    expect(titles.get('tt0000002')).toBe('デスノート');
  });

  it('Wikidata側が壊れていると分かっている作品は使わない', () => {
    const titles = parseSparqlResponse({
      results: {bindings: [binding('tt0093765', '1988年版')]},
    });

    expect(titles.has('tt0093765')).toBe(false);
  });

  it('日本語を含まないラベルは使わない', () => {
    const titles = parseSparqlResponse({
      results: {bindings: [binding('tt0000003', 'Rashomon')]},
    });

    expect(titles.has('tt0000003')).toBe(false);
  });
});
