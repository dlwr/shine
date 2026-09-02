import {describe, expect, it} from 'vitest';
import {
  findJapanPersonAwardSource,
  JAPAN_PERSON_AWARD_SOURCES,
} from '../japan-person-awards';

describe('JAPAN_PERSON_AWARD_SOURCES', () => {
  it('6賞を --award の名前で引ける', () => {
    expect(JAPAN_PERSON_AWARD_SOURCES.map(source => source.key)).toEqual([
      'kinema-junpo',
      'mainichi',
      'blue-ribbon',
      'hochi',
      'yokohama',
      'nikkan-sports',
    ]);
    expect(findJapanPersonAwardSource('hochi')?.organizationName).toBe(
      'Hochi Film Awards',
    );
    expect(findJapanPersonAwardSource('unknown')).toBeUndefined();
  });

  it('部門はDBの部門名に対応する', () => {
    expect(
      Object.fromEntries(
        JAPAN_PERSON_AWARD_SOURCES.map(source => [
          source.key,
          [...new Set(source.categories.map(category => category.category))],
        ]),
      ),
    ).toEqual({
      'kinema-junpo': [
        '日本映画監督賞',
        '主演男優賞',
        '主演女優賞',
        '助演男優賞',
        '助演女優賞',
        '外国映画監督賞',
      ],
      mainichi: [
        '監督賞',
        '男優主演賞',
        '女優主演賞',
        '男優助演賞',
        '女優助演賞',
        '主演俳優賞',
        '助演俳優賞',
      ],
      'blue-ribbon': [
        '監督賞',
        '主演男優賞',
        '主演女優賞',
        '助演男優賞',
        '助演女優賞',
      ],
      hochi: ['監督賞', '主演男優賞', '主演女優賞', '助演男優賞', '助演女優賞'],
      yokohama: [
        '監督賞',
        '主演男優賞',
        '主演女優賞',
        '助演男優賞',
        '助演女優賞',
      ],
      'nikkan-sports': [
        '監督賞',
        '主演男優賞',
        '主演女優賞',
        '助演男優賞',
        '助演女優賞',
      ],
    });
  });

  it('回次は作品賞と同じ計算を使う', () => {
    expect(
      JAPAN_PERSON_AWARD_SOURCES.map(source => [
        source.key,
        source.ceremonyNumber(source.establishedYear),
      ]),
    ).toEqual([
      ['kinema-junpo', 1],
      ['mainichi', 1],
      ['blue-ribbon', 1],
      ['hochi', 1],
      ['yokohama', 1],
      ['nikkan-sports', 1],
    ]);
    expect(
      findJapanPersonAwardSource('kinema-junpo')?.ceremonyNumber(1955),
    ).toBe(29);
    expect(findJapanPersonAwardSource('yokohama')?.ceremonyNumber(2024)).toBe(
      46,
    );
    expect(
      findJapanPersonAwardSource('nikkan-sports')?.ceremonyNumber(2025),
    ).toBe(38);
  });
});

describe('TMDb のクレジット名に寄せる別名', () => {
  it.each([
    ['ユースケ・サンタマリア', '中山裕介'],
    ['桜田淳子', 'Junko Sakurada'],
    ['阿木燿子', 'Yoko Aki'],
  ])('%s は全ての賞で %s として引き当てる', (article, credit) => {
    for (const source of JAPAN_PERSON_AWARD_SOURCES) {
      expect(source.personNameAliases?.[article]).toBe(credit);
    }
  });
});
