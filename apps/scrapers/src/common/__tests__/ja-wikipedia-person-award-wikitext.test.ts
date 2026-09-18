import {describe, expect, it} from 'vitest';
import {
  parseListPersonAwardWikitext,
  type ListPersonAwardCategory,
} from '../ja-wikipedia-person-award-wikitext';

const categories: ListPersonAwardCategory[] = [
  {names: ['監督賞'], category: '監督賞', role: 'director'},
  {names: ['主演男優賞', '男優賞'], category: '主演男優賞', role: 'actor'},
];

const article = (...lines: string[]): string => lines.join('\n');

const parse = (...lines: string[]) =>
  parseListPersonAwardWikitext(article(...lines), categories);

describe('parseListPersonAwardWikitext', () => {
  it('見出しの回次と年を回に持たせる', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 監督賞 [[是枝裕和]]『[[怪物 (2023年の映画)|怪物]]』',
    );

    expect(edition).toMatchObject({year: 2023, ceremonyNumber: 75});
  });

  it('受賞者と作品を部門ごとに取る', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 監督賞 [[是枝裕和]]『[[怪物 (2023年の映画)|怪物]]』',
    );

    expect(edition.entries).toEqual([
      {
        category: '監督賞',
        people: [{name: '是枝裕和', page: '是枝裕和'}],
        films: [{page: '怪物 (2023年の映画)', title: '怪物'}],
      },
    ]);
  });

  it('記事での旧名でも同じ部門として読む', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 男優賞 [[役所広司]]『[[PERFECT DAYS]]』',
    );

    expect(edition.entries[0].category).toBe('主演男優賞');
  });

  it('定義に無い部門の行は読まない', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 新人賞 [[誰か]]『[[ある映画]]』',
    );

    expect(edition.entries).toEqual([]);
  });

  it('該当者なしの年は受賞にしない', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 監督賞 該当者なし',
    );

    expect(edition.entries).toEqual([]);
  });

  it('部門に対象年度の指定があればその年だけ読む', () => {
    const editions = parseListPersonAwardWikitext(
      article(
        '==== 第75回（2023年度）====',
        '* 監督賞 [[是枝裕和]]『[[怪物 (2023年の映画)|怪物]]』',
        '==== 第76回（2024年度）====',
        '* 監督賞 [[山中瑶子]]『[[ナミビアの砂漠]]』',
      ),
      [
        {
          names: ['監督賞'],
          category: '監督賞',
          role: 'director',
          years: [2024],
        },
      ],
    );

    expect(editions.map(edition => edition.entries.length)).toEqual([0, 1]);
  });

  it('記事の無い受賞者は名前だけを持つ', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 監督賞 新人監督『[[ある映画]]』',
    );

    expect(edition.entries[0].people).toEqual([{name: '新人監督'}]);
  });

  it('リンクの曖昧さ回避の括弧を名前から外す', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 監督賞 [[山田洋次 (映画監督)]]『[[ある映画]]』',
    );

    expect(edition.entries[0].people).toEqual([
      {name: '山田洋次', page: '山田洋次 (映画監督)'},
    ]);
  });

  it('連名の受賞者を読点で分ける', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 監督賞 山田太郎、鈴木花子『[[ある映画]]』',
    );

    expect(edition.entries[0].people).toEqual([
      {name: '山田太郎'},
      {name: '鈴木花子'},
    ]);
  });

  it('「ほか」を受賞者として数えない', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 監督賞 山田太郎、ほか『[[ある映画]]』',
    );

    expect(edition.entries[0].people).toEqual([{name: '山田太郎'}]);
  });

  it('同じ行に複数の受賞者と作品があれば組ごとに分ける', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 監督賞 [[是枝裕和]]『[[怪物 (2023年の映画)|怪物]]』、[[山中瑶子]]『[[ナミビアの砂漠]]』',
    );

    expect(edition.entries).toEqual([
      {
        category: '監督賞',
        people: [{name: '是枝裕和', page: '是枝裕和'}],
        films: [{page: '怪物 (2023年の映画)', title: '怪物'}],
      },
      {
        category: '監督賞',
        people: [{name: '山中瑶子', page: '山中瑶子'}],
        films: [{page: 'ナミビアの砂漠', title: 'ナミビアの砂漠'}],
      },
    ]);
  });

  it('本文が空なら子項目の行を読む', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 主演男優賞',
      '** [[役所広司]]『[[PERFECT DAYS]]』',
      '** [[安藤サクラ]]『[[ある映画]]』',
    );

    expect(edition.entries).toHaveLength(2);
    expect(edition.entries[0].people[0].name).toBe('役所広司');
  });

  it('同じ深さの行が来たら子項目の読み取りを止める', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 主演男優賞',
      '** [[役所広司]]『[[PERFECT DAYS]]』',
      '* 監督賞 [[是枝裕和]]『[[怪物 (2023年の映画)|怪物]]』',
    );

    expect(edition.entries.map(entry => entry.category)).toEqual([
      '主演男優賞',
      '監督賞',
    ]);
  });

  it('作品の記事名は同じ回の別の行から補う', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 監督賞 [[是枝裕和]]『[[怪物 (2023年の映画)|怪物]]』',
      '* 主演男優賞 [[安藤サクラ]]『怪物』',
    );

    expect(edition.entries[1].films).toEqual([
      {page: '怪物 (2023年の映画)', title: '怪物'},
    ]);
  });

  it('仮リンクの作品は題名だけを取る', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 監督賞 [[誰か]]『{{仮リンク|未公開作|en|Unreleased Film}}』',
    );

    expect(edition.entries[0].films).toEqual([{title: '未公開作'}]);
  });

  it('出典の中の名前や題名を拾わない', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 監督賞 [[是枝裕和]]『[[怪物 (2023年の映画)|怪物]]』<ref>[[別の人]]『[[別の映画]]』</ref>',
    );

    expect(edition.entries).toHaveLength(1);
    expect(edition.entries[0].films).toEqual([
      {page: '怪物 (2023年の映画)', title: '怪物'},
    ]);
  });

  it('作品が無い受賞者の組は捨てる', () => {
    const [edition] = parse(
      '==== 第75回（2023年度）====',
      '* 監督賞 [[是枝裕和]]',
    );

    expect(edition.entries).toEqual([]);
  });
});
