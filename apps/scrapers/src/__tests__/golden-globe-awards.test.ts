import {describe, expect, it} from 'vitest';
import {
  awardConfig,
  parseAwardEditions,
  toImdbEventData,
} from '../common/en-wikipedia-award';
import {
  GOLDEN_GLOBE_AWARDS,
  GOLDEN_GLOBE_SOURCE,
  goldenGlobeCeremonyYear,
} from '../golden-globe-awards';

const DRAMA = GOLDEN_GLOBE_AWARDS[0];
const MUSICAL_OR_COMEDY = GOLDEN_GLOBE_AWARDS[1];
const NON_ENGLISH = GOLDEN_GLOBE_AWARDS[2];
const DIRECTOR = GOLDEN_GLOBE_AWARDS[4];

const SPLIT_WIKITEXT = `
==Winners and nominations==
===1958–1962===
{| class="wikitable" style="width:100%; text-align:left"
|-
! style="width:4%;"| Year
! style="width:16%;"| Comedy
! style="width:16%;"| Director
! style="width:16%;"| Producer
! style="width:16%;"| Musical
! style="width:16%;"| Director
! style="width:16%;"| Producer
|-
! rowspan="2" style="text-align:center;" | [[17th Golden Globe Awards|1959]]
| style="background:#b0c4de; text-align:left;" | '''''[[Some Like It Hot]]''''' || colspan="2" style="background:#B0C4DE;" | '''[[Billy Wilder]]''' || style="background:#90ee90; text-align:left;" | '''''[[Porgy and Bess (film)|Porgy and Bess]]''''' || [[Otto Preminger]] || [[Samuel Goldwyn]]
|-
| style="text-align:left;"|''[[Who Was That Lady?]]'' || George Sidney || Norman Krasna || ''[[Say One for Me]]'' || [[Frank Tashlin]] || Frank Tashlin
|}
`;

const NON_ENGLISH_WIKITEXT = `
==Winners and nominations==
=== 2020s ===
{| class="wikitable sortable"
|-bgcolor="#CCCCCC"
! width="100" |Year
! width="300" |English title
! width="300" |Original title
! width="200" |Director
! width="200" |Country
|-
! rowspan="2" style="text-align:center;" |[[79th Golden Globe Awards|2021]]
| style="background:#B0C4DE;" | '''''[[Drive My Car (film)|Drive My Car]]'''''|| style="background:#B0C4DE;" |'''ドライブ・マイ・カー'''|| style="background:#B0C4DE;" | '''[[Ryusuke Hamaguchi]]'''|| style="background:#B0C4DE;" | '''Japan'''
|-
|''[[Compartment No. 6]]''
|''Hytti nro 6''
|[[Juho Kuosmanen]]
|Finland
|}
`;

describe('GOLDEN_GLOBE_AWARDS', () => {
  it('作品賞4部門と監督賞と演技賞6部門を持つ', () => {
    expect(GOLDEN_GLOBE_AWARDS.map(award => award.category)).toEqual([
      'Golden Globe Award for Best Motion Picture – Drama',
      'Golden Globe Award for Best Motion Picture – Musical or Comedy',
      'Golden Globe Award for Best Motion Picture – Non-English Language',
      'Golden Globe Award for Best Animated Feature Film',
      'Golden Globe Award for Best Director',
      'Golden Globe Award for Best Actor in a Motion Picture – Drama',
      'Golden Globe Award for Best Actor in a Motion Picture – Musical or Comedy',
      'Golden Globe Award for Best Actress in a Motion Picture – Drama',
      'Golden Globe Award for Best Actress in a Motion Picture – Musical or Comedy',
      'Golden Globe Award for Best Supporting Actor – Motion Picture',
      'Golden Globe Award for Best Supporting Actress – Motion Picture',
    ]);
  });

  it('作品賞4部門だけ人物を引かない', () => {
    expect(GOLDEN_GLOBE_AWARDS.map(award => award.role)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      'director',
      'actor',
      'actor',
      'actor',
      'actor',
      'actor',
      'actor',
    ]);
  });
});

describe('goldenGlobeCeremonyYear', () => {
  it('第1回を1944年として数える', () => {
    expect(goldenGlobeCeremonyYear(1)).toBe(1944);
    expect(goldenGlobeCeremonyYear(78)).toBe(2021);
    expect(goldenGlobeCeremonyYear(83)).toBe(2026);
  });
});

describe('parseAwardEditions', () => {
  it('ミュージカル・コメディ部門はコメディ列とミュージカル列の両方を読み、どちらの受賞色も受賞にする', () => {
    const [edition] = parseAwardEditions(
      GOLDEN_GLOBE_SOURCE,
      MUSICAL_OR_COMEDY,
      SPLIT_WIKITEXT,
    );

    expect(edition.ceremonyNumber).toBe(17);
    expect(
      edition.entries.map(entry => [entry.filmTitle, entry.isWinner]),
    ).toEqual([
      ['Some Like It Hot', true],
      ['Porgy and Bess', true],
      ['Who Was That Lady?', false],
      ['Say One for Me', false],
    ]);
  });

  it('非英語映画賞は English title 列を作品にする', () => {
    const [edition] = parseAwardEditions(
      GOLDEN_GLOBE_SOURCE,
      NON_ENGLISH,
      NON_ENGLISH_WIKITEXT,
    );

    expect(edition).toEqual({
      filmYear: 2021,
      ceremonyNumber: 79,
      entries: [
        {
          filmPage: 'Drive My Car (film)',
          filmTitle: 'Drive My Car',
          isWinner: true,
        },
        {
          filmPage: 'Compartment No. 6',
          filmTitle: 'Compartment No. 6',
          isWinner: false,
        },
      ],
    });
  });
});

describe('toImdbEventData', () => {
  it('授賞式の年は公開年の翌年になる', () => {
    const data = toImdbEventData(
      GOLDEN_GLOBE_SOURCE,
      DRAMA,
      [
        {
          filmYear: 1943,
          ceremonyNumber: 1,
          entries: [
            {
              filmPage: 'The Song of Bernadette (film)',
              filmTitle: 'The Song of Bernadette',
              isWinner: true,
            },
          ],
        },
      ],
      new Map([['The Song of Bernadette (film)', {imdbId: 'tt0036377'}]]),
    );

    expect(data.editions.map(edition => edition.year)).toEqual([1944]);
    expect(
      data.editions[0].targetAward[0].categories[0].nominations[0].titles[0]
        .imdbId,
    ).toBe('tt0036377');
  });
});

describe('GOLDEN_GLOBE_SOURCE', () => {
  it('記事にリンクの無い作品は回次と表示名で直接指す', () => {
    const data = toImdbEventData(
      GOLDEN_GLOBE_SOURCE,
      NON_ENGLISH,
      [
        {
          filmYear: 1956,
          ceremonyNumber: 14,
          entries: [
            {
              filmPage: undefined,
              filmTitle: 'Roses on the Arm',
              isWinner: true,
            },
          ],
        },
      ],
      new Map(),
    );

    expect(
      data.editions[0].targetAward[0].categories[0].nominations[0].titles[0]
        .imdbId,
    ).toBe('tt0049821');
  });
});

describe('GOLDEN_GLOBE_SOURCE の別名表', () => {
  it('記事の表記と TMDb のクレジット名が違う人物を寄せる', () => {
    const data = toImdbEventData(
      GOLDEN_GLOBE_SOURCE,
      GOLDEN_GLOBE_AWARDS[9],
      [
        {
          filmYear: 1981,
          ceremonyNumber: 39,
          entries: [
            {
              personName: 'Howard E. Rollins, Jr.',
              filmPage: 'Ragtime (film)',
              filmTitle: 'Ragtime',
              isWinner: false,
            },
          ],
        },
      ],
      new Map([['Ragtime (film)', {imdbId: 'tt0082970'}]]),
    );

    expect(
      data.editions[0].targetAward[0].categories[0].nominations[0].people,
    ).toEqual([{name: 'Howard Rollins'}]);
  });
});

describe('awardConfig', () => {
  it('ゴールデングローブ賞の組織に紐づける', () => {
    expect(awardConfig(GOLDEN_GLOBE_SOURCE, DRAMA)).toMatchObject({
      organizationName: 'Golden Globe Awards',
      organizationCountry: 'United States',
      establishedYear: 1944,
      categoryName: 'Golden Globe Award for Best Motion Picture – Drama',
      categoryShortName: 'Best Motion Picture – Drama',
      personRole: undefined,
    });
  });

  it('監督賞は監督のクレジットから人物を引く', () => {
    expect(awardConfig(GOLDEN_GLOBE_SOURCE, DIRECTOR).personRole).toBe(
      'director',
    );
  });

  it('授賞式の年から回次を引く', () => {
    const config = awardConfig(GOLDEN_GLOBE_SOURCE, DRAMA);

    expect(config.ceremonyNumber(1944)).toBe(1);
    expect(config.ceremonyNumber(2026)).toBe(83);
  });
});
