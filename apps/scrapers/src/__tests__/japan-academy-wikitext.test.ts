import {describe, expect, it} from 'vitest';
import {parseJapanAcademyWikitext} from '../japan-academy-wikitext';

const wikitext = `== 選考基準 ==
本文。

== 受賞作品の一覧 ==
以下は{{Color box|#FAEB86|'''最優秀賞受賞作'''}}と 優秀賞受賞作 の一覧である。

=== 1970年代 ===
{| class="wikitable" border="1" width="100%"
|+ style="text-align:left" |{{big|[[1977年の映画|1977年]]}}[[第1回日本アカデミー賞|（第1回）]]<ref>{{Cite web|url=https://example.com}}</ref>
|- style="background:#bebebe"
! width="35%"|作品名
! width="35%"|製作会社
! width="15%"|監督
! width="15%"|脚本
|-style="background:#FAEB86"
| '''[[幸福の黄色いハンカチ]]'''
| '''[[松竹]]'''
| '''[[山田洋次]]'''
| '''山田洋次'''、'''[[朝間義隆]]'''
|-
| [[青春の門#1975年・1977年版|青春の門・自立篇]]
| [[TOHOスタジオ|東宝映画]]
| [[浦山桐郎]]
| [[早坂暁]]、浦山桐郎
|-
| [[竹山ひとり旅]]
| [[近代映画協会]]
| colspan="2" style="text-align:center;" |[[新藤兼人]]
|}

{| class="wikitable" border="1" width="100%"
|+ style="text-align:left" |{{big|[[1978年の映画|1978年]]}}[[第2回日本アカデミー賞|（第2回）]]
|- style="background:#bebebe"
! width="35%"|作品名
|-style="background:#FAEB86"
| '''[[事件 (小説)#映画|事件]]'''
| '''[[松竹]]'''
|}

== 記録 ==
{| class="wikitable"
|+ 複数回最優秀賞を受賞した監督
|-
| [[山田洋次]]
| 3回
|}
`;

describe('parseJapanAcademyWikitext', () => {
  it('回ごとに分割する', () => {
    const editions = parseJapanAcademyWikitext(wikitext);

    expect(editions.map(edition => edition.ceremonyNumber)).toEqual([1, 2]);
  });

  it('キャプションから対象作品の年を取る', () => {
    const editions = parseJapanAcademyWikitext(wikitext);

    expect(editions.map(edition => edition.year)).toEqual([1977, 1978]);
  });

  it('作品名と記事名を取る', () => {
    const [edition] = parseJapanAcademyWikitext(wikitext);

    expect(edition.films.map(film => film.title)).toEqual([
      '幸福の黄色いハンカチ',
      '青春の門・自立篇',
      '竹山ひとり旅',
    ]);
  });

  it('表示名が違う場合も記事名を拾う', () => {
    const [edition] = parseJapanAcademyWikitext(wikitext);

    expect(edition.films.map(film => film.page)).toEqual([
      '幸福の黄色いハンカチ',
      '青春の門',
      '竹山ひとり旅',
    ]);
  });

  it('背景色から最優秀賞を判定する', () => {
    const [edition] = parseJapanAcademyWikitext(wikitext);

    expect(edition.films.map(film => film.isWinner)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('セクションリンクは記事名だけを使う', () => {
    const [, edition] = parseJapanAcademyWikitext(wikitext);

    expect(edition.films).toEqual([
      {page: '事件 (小説)', title: '事件', isWinner: true},
    ]);
  });

  it('記録セクションの表は読まない', () => {
    const editions = parseJapanAcademyWikitext(wikitext);

    expect(editions).toHaveLength(2);
  });
});
