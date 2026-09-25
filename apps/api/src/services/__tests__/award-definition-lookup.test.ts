import type {SQL} from '@shine/database';
import {SQLiteSyncDialect} from 'drizzle-orm/sqlite-core';
import {describe, expect, it} from 'vitest';
import {
  awardPageLinkForOrganizationName,
  awardPageNominations,
  findPersonAwardDefinition,
  findTopAwardPageDefinition,
  japaneseAwardNames,
  personAwardNominations,
} from '../award-definition-lookup';

describe('awardPageLinkForOrganizationName', () => {
  it('returns the slug and year-page availability for a year-grouped award', () => {
    expect(awardPageLinkForOrganizationName('Academy Awards')).toEqual({
      slug: 'academy-best-picture',
      hasYearPages: true,
    });
  });

  it('映画祭のサブ賞にも賞ページの slug を返す', () => {
    expect(
      awardPageLinkForOrganizationName('Cannes Film Festival', 'Grand Prix'),
    ).toEqual({
      slug: 'cannes-grand-prix',
      hasYearPages: true,
    });
  });

  it('returns hasYearPages false for a list-grouped award', () => {
    expect(awardPageLinkForOrganizationName('Variety')).toEqual({
      slug: 'variety-top-100',
      hasYearPages: false,
    });
  });

  it('returns no slug for an organization without an award page', () => {
    expect(awardPageLinkForOrganizationName('Unknown Org')).toEqual({
      slug: undefined,
      hasYearPages: false,
    });
  });

  it('picks the page matching the category when an organization has several', () => {
    expect(
      awardPageLinkForOrganizationName('Kinema Junpo', 'Best Foreign Film'),
    ).toEqual({
      slug: 'kinema-junpo-foreign',
      hasYearPages: true,
    });
    expect(
      awardPageLinkForOrganizationName('Kinema Junpo', 'Best Japanese Film'),
    ).toEqual({
      slug: 'kinema-junpo-japanese',
      hasYearPages: true,
    });
  });

  it('returns no slug when the category of a multi-page organization is unknown', () => {
    expect(awardPageLinkForOrganizationName('Kinema Junpo')).toEqual({
      slug: undefined,
      hasYearPages: false,
    });
  });

  it('賞ページが1つの組織でも、そのページに属さないカテゴリには slug を返さない', () => {
    expect(
      awardPageLinkForOrganizationName('Japan Academy Awards', '監督賞'),
    ).toEqual({
      slug: undefined,
      hasYearPages: false,
    });
  });

  it('賞ページが1つの組織で、そのページのカテゴリなら slug を返す', () => {
    expect(
      awardPageLinkForOrganizationName('Japan Academy Awards', '優秀作品賞'),
    ).toEqual({
      slug: 'japan-academy-best-picture',
      hasYearPages: true,
    });
  });
});

describe('findTopAwardPageDefinition', () => {
  it('最高賞の賞ページを返す', () => {
    expect(
      findTopAwardPageDefinition('Cannes Film Festival', "Palme d'Or")?.slug,
    ).toBe('palme-dor');
  });

  it('サブ賞の賞ページは返さない', () => {
    expect(
      findTopAwardPageDefinition('Cannes Film Festival', 'Grand Prix'),
    ).toBeUndefined();
  });
});

describe('japaneseAwardNames', () => {
  it('組織名の日本語表記を返す', () => {
    expect(japaneseAwardNames('Venice Film Festival', 'Golden Lion')).toEqual({
      organization: 'ヴェネツィア国際映画祭',
      category: '金獅子賞',
    });
  });

  it('映画祭のサブ賞の日本語表記を返す', () => {
    expect(
      japaneseAwardNames(
        'Berlin International Film Festival',
        'Silver Bear Grand Jury Prize',
      ),
    ).toEqual({
      organization: 'ベルリン国際映画祭',
      category: '銀熊賞（審査員グランプリ）',
    });
  });

  it('複数の賞ページを持つ組織はカテゴリで選ぶ', () => {
    expect(japaneseAwardNames('Kinema Junpo', 'Best Japanese Film')).toEqual({
      organization: 'キネマ旬報',
      category: '日本映画ベスト・テン',
    });
  });

  it('複数カテゴリを束ねるページではカテゴリ名を上書きしない', () => {
    expect(japaneseAwardNames('Japan Academy Awards', '優秀作品賞')).toEqual({
      organization: '日本アカデミー賞',
    });
  });

  it('賞ページの無い組織には何も返さない', () => {
    expect(japaneseAwardNames('Unknown Org', 'Unknown Category')).toEqual({});
  });

  it('賞ページに属さないカテゴリでは組織名だけ返す', () => {
    expect(japaneseAwardNames('Japan Academy Awards', '監督賞')).toEqual({
      organization: '日本アカデミー賞',
    });
  });

  it('部門名が英語の個人賞は部門名も日本語にする', () => {
    expect(
      japaneseAwardNames('Academy Awards', 'Academy Award for Best Director'),
    ).toEqual({
      organization: 'アカデミー賞',
      category: '監督賞',
    });
  });
});

describe('findPersonAwardDefinition', () => {
  it('アカデミー賞の監督賞を引く', () => {
    expect(
      findPersonAwardDefinition(
        'Academy Awards',
        'Academy Award for Best Director',
      )?.slug,
    ).toBe('academy-director');
  });

  it('アカデミー賞の助演女優賞を引く', () => {
    expect(
      findPersonAwardDefinition(
        'Academy Awards',
        'Academy Award for Best Supporting Actress',
      )?.slug,
    ).toBe('academy-supporting-actress');
  });

  it('日本アカデミー賞の監督賞を引く', () => {
    expect(
      findPersonAwardDefinition('Japan Academy Awards', '監督賞')?.slug,
    ).toBe('japan-academy-director');
  });

  it('カンヌ国際映画祭の女優賞を引く', () => {
    expect(
      findPersonAwardDefinition('Cannes Film Festival', 'Best Actress')?.slug,
    ).toBe('cannes-best-actress');
  });

  it('ヴェネツィア国際映画祭のヴォルピ杯女優賞を引く', () => {
    expect(
      findPersonAwardDefinition(
        'Venice Film Festival',
        'Volpi Cup for Best Actress',
      )?.slug,
    ).toBe('venice-best-actress');
  });

  it('ヴェネツィア国際映画祭の銀獅子賞を監督賞として引く', () => {
    expect(
      findPersonAwardDefinition(
        'Venice Film Festival',
        'Silver Lion for Best Director',
      )?.role,
    ).toBe('director');
  });

  it('ベルリン国際映画祭の銀熊賞（監督賞）を引く', () => {
    expect(
      findPersonAwardDefinition(
        'Berlin International Film Festival',
        'Silver Bear for Best Director',
      )?.slug,
    ).toBe('berlin-best-director');
  });

  it('ベルリン国際映画祭の2020年までの男優賞と2021年からの主演俳優賞は別のページ', () => {
    expect(
      findPersonAwardDefinition(
        'Berlin International Film Festival',
        'Silver Bear for Best Actor',
      )?.slug,
    ).toBe('berlin-best-actor');
    expect(
      findPersonAwardDefinition(
        'Berlin International Film Festival',
        'Silver Bear for Best Leading Performance',
      )?.slug,
    ).toBe('berlin-best-leading-performance');
  });

  it('ベルリン国際映画祭の助演俳優賞を俳優の賞として引く', () => {
    expect(
      findPersonAwardDefinition(
        'Berlin International Film Festival',
        'Silver Bear for Best Supporting Performance',
      )?.role,
    ).toBe('actor');
  });
});

describe('award definition conditions', () => {
  const dialect = new SQLiteSyncDialect();
  const parametersOf = (condition: SQL | undefined) =>
    condition ? dialect.sqlToQuery(condition).params : [];

  it('awardPageNominations は賞の定義を bind 変数にしない', () => {
    expect(parametersOf(awardPageNominations())).toEqual([]);
  });

  it('personAwardNominations は賞の定義を bind 変数にしない', () => {
    expect(parametersOf(personAwardNominations())).toEqual([]);
  });
});
