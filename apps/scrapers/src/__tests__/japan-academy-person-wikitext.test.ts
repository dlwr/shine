import {describe, expect, it} from 'vitest';
import {parseJapanAcademyPersonWikitext} from '../japan-academy-person-wikitext';

const DIRECTOR_WIKITEXT = `
== 受賞作品の一覧 ==
=== 1970年代 ===
{| class="wikitable" border="1" style="text-align:center" width="70%"
|- style="background:#bebebe"
! width="15%"|年
! 監督
! 作品名
! 脚注
|-
| rowspan="4"|'''[[1977年の映画|1977年]]'''<br>[[第1回日本アカデミー賞|（第1回）]]
| style="background:#FAEB86" rowspan="2"|'''[[山田洋次]]'''
| style="background:#FAEB86"|'''[[幸福の黄色いハンカチ]]'''
| rowspan="4"|<ref>{{cite web|url=https://example.com|title=第1回}}</ref>
|-
| style="background:#FAEB86"|'''[[男はつらいよ|男はつらいよシリーズ]]'''<ref group="注釈">注</ref>
|-
| rowspan="2"|[[市川崑]]
| [[悪魔の手毬唄 (1977年の映画)|悪魔の手毬唄]]
|-
| [[獄門島 (1977年の映画)|獄門島]]
|}

=== 1980年代 ===
{| class="wikitable"
|- style="background:#bebebe"
! width="15%"|年
! 監督
! 作品名
! 脚注
|-
| '''[[1980年の映画|1980年]]'''<br>[[第4回日本アカデミー賞|（第4回）]]
| style="background:#FAEB86"|'''[[鈴木清順]]'''
| style="background:#FAEB86"|'''[[ツィゴイネルワイゼン (映画)|ツィゴイネルワイゼン]]'''
| <ref>ref</ref>
|}

== 脚注 ==
`;

const SUPPORTING_ACTOR_WIKITEXT = `
== 受賞作品の一覧 ==
=== 2020年代 ===
{| class="wikitable"
|- style="background:#bebebe"
! width="15%"|年
! 男優
! 作品名
! 役名
! width="5%"|脚注
|-
| rowspan="2"|'''[[2025年の映画|2025年]]'''<br>[[第49回日本アカデミー賞|（第49回）]]
| [[横浜流星]]
| [[国宝 (小説)#映画|国宝]]
| 大垣俊介 (花井半弥)
| rowspan="2"|<ref>ref</ref>
|-
|-
| [[渡辺謙]]
| [[国宝 (小説)#映画|国宝]]
| 花井半二郎
|}

== 関連項目 ==
`;

describe('parseJapanAcademyPersonWikitext', () => {
  it('年と回次を取り出す', () => {
    const editions = parseJapanAcademyPersonWikitext(DIRECTOR_WIKITEXT);

    expect(editions[0]).toMatchObject({year: 1977, ceremonyNumber: 1});
  });

  it('年のrowspanを次の行に引き継ぐ', () => {
    const editions = parseJapanAcademyPersonWikitext(DIRECTOR_WIKITEXT);

    expect(editions[0].entries).toHaveLength(4);
  });

  it('人物のrowspanを次の行に引き継ぐ', () => {
    const editions = parseJapanAcademyPersonWikitext(DIRECTOR_WIKITEXT);

    expect(editions[0].entries.map(entry => entry.personPage)).toEqual([
      '山田洋次',
      '山田洋次',
      '市川崑',
      '市川崑',
    ]);
  });

  it('作品のページ名と表示名を分けて返す', () => {
    const editions = parseJapanAcademyPersonWikitext(DIRECTOR_WIKITEXT);

    expect(editions[0].entries[2]).toMatchObject({
      filmPage: '悪魔の手毬唄 (1977年の映画)',
      filmTitle: '悪魔の手毬唄',
    });
  });

  it('作品ページの節指定を落とす', () => {
    const editions = parseJapanAcademyPersonWikitext(SUPPORTING_ACTOR_WIKITEXT);

    expect(editions[0].entries[0].filmPage).toBe('国宝 (小説)');
  });

  it('最優秀賞の行を受賞として返す', () => {
    const editions = parseJapanAcademyPersonWikitext(DIRECTOR_WIKITEXT);

    expect(editions[0].entries.map(entry => entry.isWinner)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('複数の表を年ごとの版に分ける', () => {
    const editions = parseJapanAcademyPersonWikitext(DIRECTOR_WIKITEXT);

    expect(editions.map(edition => edition.year)).toEqual([1977, 1980]);
  });

  it('役名の列がある表でも作品名の列を取り違えない', () => {
    const editions = parseJapanAcademyPersonWikitext(SUPPORTING_ACTOR_WIKITEXT);

    expect(editions[0].entries.map(entry => entry.filmTitle)).toEqual([
      '国宝',
      '国宝',
    ]);
  });

  it('同じ作品で複数の人物を返す', () => {
    const editions = parseJapanAcademyPersonWikitext(SUPPORTING_ACTOR_WIKITEXT);

    expect(editions[0].entries.map(entry => entry.personPage)).toEqual([
      '横浜流星',
      '渡辺謙',
    ]);
  });

  it('空の行区切りでrowspanを消費しない', () => {
    const editions = parseJapanAcademyPersonWikitext(SUPPORTING_ACTOR_WIKITEXT);

    expect(editions[0].entries).toHaveLength(2);
  });

  it('受賞作品の一覧が無ければ空を返す', () => {
    expect(parseJapanAcademyPersonWikitext('== 概要 ==\n本文')).toEqual([]);
  });
});
