import {describe, expect, it} from 'vitest';
import {
  MAINICHI_NOMINATION_ARTICLES,
  parseMainichiNominationWikitext,
} from '../mainichi-person-nominations';

const WIKITEXT = `
==受賞者リスト==
以下、受賞者とノミネートの一覧である<ref>出典</ref>。

=== 2010年代 ===
{| class="wikitable" style="width:100%"
! style="width:5%"|回
! style="width:7%"|年
! style="width:24%"|俳優
! style="width:64%"|作品
|-
|style="text-align:center" |69||[[2014年の日本公開映画|2014]]||[[役所広司]]||[[渇き。]]
|}

=== 2020年代 ===
{| class="wikitable" style="width:100%"
|- bgcolor="#bebebe"
! width="5%" | 回
! width="7%" | 年
! width="24%" | 俳優
! width="34%" | 作品
! width="30%" | 役名
|-
| rowspan=3 style="text-align:center" | [[第75回毎日映画コンクール|75]]
| rowspan=3 style="text-align:center" | [[2020年の日本公開映画|2020]]
|- style="background:#FAEB86"
| '''[[森山未來]]'''
| '''[[武正晴#映画|アンダードッグ]]'''
| '''末永晃'''
|-
| [[石橋蓮司]]
| [[一度も撃ってません]]
| 市川進 / 御前零児
|-
| rowspan=5 style="text-align:center" | [[第79回毎日映画コンクール|79]] || rowspan=5 style="text-align:center" | [[2024年の日本公開映画|2024]]
|- style="background:#FAEB86"
| rowspan="2" |'''[[河合優実]]'''
| '''[[あんのこと]]'''
| '''香川杏'''
|- style="background:#FAEB86"
| '''[[ナミビアの砂漠]]'''
| '''カナ'''
|- 
| [[佐藤健 (俳優)|佐藤健]]
| [[護られなかった者たちへ#映画|護られなかった者たちへ]]<ref name="a" />
| 利根泰久
|-
| 山口馬木也
| 侍タイムスリッパー
| 高坂新左衛門
|}

==脚注==
`;

describe('parseMainichiNominationWikitext', () => {
  const editions = parseMainichiNominationWikitext(WIKITEXT, '男優主演賞');

  it('役名の列がある表だけを読む', () => {
    expect(editions.map(edition => edition.year)).toEqual([2020, 2024]);
  });

  it('回次は年度から計算する', () => {
    expect(editions[0].ceremonyNumber).toBe(75);
  });

  it('受賞者は背景色で判定する', () => {
    expect(editions[0].entries).toEqual([
      {
        category: '男優主演賞',
        people: [{name: '森山未來', page: '森山未來'}],
        films: [{page: '武正晴', title: 'アンダードッグ'}],
        isWinner: true,
      },
      {
        category: '男優主演賞',
        people: [{name: '石橋蓮司', page: '石橋蓮司'}],
        films: [{page: '一度も撃ってません', title: '一度も撃ってません'}],
        isWinner: false,
      },
    ]);
  });

  it('回と年が1行に並ぶ形式も読む', () => {
    expect(editions[1].year).toBe(2024);
    expect(editions[1].entries).toHaveLength(4);
  });

  it('俳優のセルが複数行にまたがれば作品ごとに受賞にする', () => {
    const kawai = editions[1].entries.filter(
      entry => entry.people[0].name === '河合優実',
    );
    expect(kawai.map(entry => entry.films[0].title)).toEqual([
      'あんのこと',
      'ナミビアの砂漠',
    ]);
    expect(kawai.every(entry => entry.isWinner)).toBe(true);
  });

  it('リンクの曖昧さ回避は名前から外し、出典は落とす', () => {
    expect(editions[1].entries[2]).toEqual({
      category: '男優主演賞',
      people: [{name: '佐藤健', page: '佐藤健 (俳優)'}],
      films: [
        {page: '護られなかった者たちへ', title: '護られなかった者たちへ'},
      ],
      isWinner: false,
    });
  });

  it('リンクの無い俳優と作品はそのまま名前と題名にする', () => {
    expect(editions[1].entries[3]).toEqual({
      category: '男優主演賞',
      people: [{name: '山口馬木也'}],
      films: [{title: '侍タイムスリッパー'}],
      isWinner: false,
    });
  });

  it('受賞者リストの節が無ければ空', () => {
    expect(parseMainichiNominationWikitext('本文だけ', '男優主演賞')).toEqual(
      [],
    );
  });
});

describe('MAINICHI_NOMINATION_ARTICLES', () => {
  it('演技賞6部門の記事に対応する', () => {
    expect(
      MAINICHI_NOMINATION_ARTICLES.map(article => article.category),
    ).toEqual([
      '男優主演賞',
      '女優主演賞',
      '男優助演賞',
      '女優助演賞',
      '主演俳優賞',
      '助演俳優賞',
    ]);
  });
});
