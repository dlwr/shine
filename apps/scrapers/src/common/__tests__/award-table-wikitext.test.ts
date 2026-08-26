import {describe, expect, it} from 'vitest';
import {
  parseFilmAwardWikitext,
  parsePersonAwardWikitext,
} from '../award-table-wikitext';

const BAFTA = {ceremonyPage: 'British Academy Film Awards'};

const DIRECTION_WIKITEXT = `
==History==
The award was first given in 1968.

==Winners and nominees==
===1960s===
{| class="wikitable sortable"
!scope="col" style="width:8%;"| Year
!scope="col" style="width:30%;"| Director(s)
!scope="col" style="width:30%;"| Film
!scope="col" style="width:2%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
| rowspan="2"| {{center|'''1968'''<br>{{small|([[22nd British Academy Film Awards|22nd]])}}}}
| style="background:#FAEB86"| '''[[Mike Nichols]]''' †
| style="background:#FAEB86"| '''''[[The Graduate]]'''''
| rowspan=2|
|-
| [[Carol Reed]] †
| ''[[Oliver! (film)|Oliver!]]''
|-
| rowspan="2"| {{center|'''1969'''<br>{{small|([[23rd British Academy Film Awards|23rd]])}}}}
| style="background:#FAEB86"| '''[[John Schlesinger]]''' †
| style="background:#FAEB86"| '''''[[Midnight Cowboy]]'''''
| rowspan=2|
|-
| [[Ken Russell]]
| ''[[Women in Love (film)|Women in Love]]''
|}

==Multiple wins and nominations==
`;

const ACTOR_WIKITEXT = `
==Winners and nominees==
===1950s===
{| class="wikitable sortable"
!scope="col" style="width:8%;"| Year
!scope="col" style="width:30%;"| Actor
!scope="col" style="width:30%;"| Films
!scope="col" style="width:30%;"| Role (s)
!scope="col" style="width:2%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
| rowspan="5"| {{center|'''1952'''<br>{{small|([[6th British Academy Film Awards|6th]])}}}}
! colspan="4"| Best British Actor
|-
| style="background:#FAEB86"| '''[[Ralph Richardson]]'''
| style="background:#FAEB86"| '''''[[The Sound Barrier]]'''''
| style="background:#FAEB86"| '''John Ridgefield'''
| rowspan=2|
|-
| [[Jack Hawkins]]
| ''[[Mandy (1952 film)|Mandy]]''
| Dick Searle
|-
! colspan="4"| Best Foreign Actor
|-
| style="background:#FAEB86"| '''[[Marlon Brando]]'''
| style="background:#FAEB86"| '''''[[Viva Zapata!]]'''''
| style="background:#FAEB86"| '''[[Emiliano Zapata]] '''
| rowspan=1|
|-
| {{center|'''1953'''<br>{{small|([[7th British Academy Film Awards|7th]])}}}}
| style="background:#FAEB86"| '''[[John Gielgud]]'''
| style="background:#FAEB86"| '''''[[Julius Caesar (1953 film)|Julius Caesar]]'''''
| style="background:#FAEB86"| '''Cassius'''
|
|}
`;

const FILM_WIKITEXT = `
==Winners and nominees==
===1940s===
{| class="wikitable" style="width:100%;"
|-
! style="width:5%;"| Year
! style="width:26%;"| Film
! style="width:22%;"| Director(s)
! style="width:22%;"| Producer(s)
! style="width:15%;"| Country
|-
! colspan="5"| Best Film from Any Source
|-
| {{center|'''1947'''<br>{{small|([[1st British Academy Film Awards|1st]])}}}}
| style="background:#FAEB86"| '''''[[The Best Years of Our Lives]]''''' †
| style="background:#FAEB86"| '''[[William Wyler]]'''
| style="background:#FAEB86"| '''[[Samuel Goldwyn]]'''
| style="background:#FAEB86"| '''[[United States]]'''
|-
| rowspan="4"| {{center|'''1948'''<br>{{small|([[2nd British Academy Film Awards|2nd]])}}}}
| style="background:#FAEB86"| '''''[[Hamlet (1948 film)|Hamlet]]''''' †
| style="background:#FAEB86"| '''[[Laurence Olivier]]'''
| style="background:#FAEB86"| '''[[Laurence Olivier]]'''
| style="background:#FAEB86"| '''[[United Kingdom]]'''
|-
| ''[[Crossfire (film)|Crossfire]]''
| [[Edward Dmytryk]]
| [[Adrian Scott]]
| [[United States]]
|-
| ''[[Paisà|Paisan]]'' (''Paisà'')
| [[Roberto Rossellini]]
| [[Rod E. Geiger]], [[Roberto Rossellini]]
| [[Italy]]
|-
| {{Lang|bn-latn|[[Pather Panchali (film)|Pather Panchali]]}} (''পথের পাঁচালী'', ''Pôther Pãchali'')
| [[Satyajit Ray]]
| Government of [[West Bengal]]
| [[India]]
|}
`;

const SUPPORTING_WIKITEXT = `
==Winners and nominees==
===1970s===
{| class="wikitable sortable"
!scope="col" style="width:8%;"| Year
!scope="col" style="width:30%;"| Actor
!scope="col" style="width:30%;"| Role(s)
!scope="col" style="width:30%;"| Film
!scope="col" style="width:2%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
| rowspan="2"| {{center|'''1970'''<br>{{small|([[24th British Academy Film Awards|24th]])}}}}
| style="background:#FAEB86"| '''[[Colin Welland]]'''
| style="background:#FAEB86"| '''''[[Kes (film)|Kes]]'''''
| style="background:#FAEB86"| '''Mr. Farthing'''
| rowspan=2|
|-
| [[Bernard Cribbins]]
| ''[[The Railway Children (1970 film)|The Railway Children]]''
| Albert Perks
|-
| {{center|'''1980'''<br>{{small|([[34th British Academy Film Awards|34th]])}}}}
| colspan="3" style="background:#ccc;"| '''''Not awarded'''''
|
|-
| {{center|'''1982'''<br>{{small|([[36th British Academy Film Awards|36th]])}}}}
| style="background:#FAEB86"| '''[[Rohini Hattangadi]] <small>(TIE)</small> {{ref label|Tie|B|1}}'''
| style="background:#FAEB86"| '''''[[Gandhi (film)|Gandhi]]'''''
| style="background:#FAEB86"| '''[[Kasturba Gandhi]]'''
|
|}
`;

describe('parsePersonAwardWikitext', () => {
  it('太字の年と回次リンクから公開年と回次を読む', () => {
    const editions = parsePersonAwardWikitext(DIRECTION_WIKITEXT, BAFTA);

    expect(
      editions.map(edition => [edition.filmYear, edition.ceremonyNumber]),
    ).toEqual([
      [1968, 22],
      [1969, 23],
    ]);
  });

  it('受賞者は背景色で判定し没後の印を除く', () => {
    const [edition] = parsePersonAwardWikitext(DIRECTION_WIKITEXT, BAFTA);

    expect(edition.entries).toEqual([
      {
        personName: 'Mike Nichols',
        filmPage: 'The Graduate',
        filmTitle: 'The Graduate',
        isWinner: true,
      },
      {
        personName: 'Carol Reed',
        filmPage: 'Oliver! (film)',
        filmTitle: 'Oliver!',
        isWinner: false,
      },
    ]);
  });

  it('Films ヘッダの表も作品列として読む', () => {
    const [edition] = parsePersonAwardWikitext(ACTOR_WIKITEXT, BAFTA);

    expect(edition.entries.map(entry => entry.filmTitle)).toEqual([
      'The Sound Barrier',
      'Mandy',
      'Viva Zapata!',
    ]);
  });

  it('表中の小見出しは候補にせず、小見出しごとの受賞者を両方受賞にする', () => {
    const [edition] = parsePersonAwardWikitext(ACTOR_WIKITEXT, BAFTA);

    expect(
      edition.entries
        .filter(entry => entry.isWinner)
        .map(entry => entry.personName),
    ).toEqual(['Ralph Richardson', 'Marlon Brando']);
  });

  it('小見出しの行も rowspan に数えて次の回がずれない', () => {
    const editions = parsePersonAwardWikitext(ACTOR_WIKITEXT, BAFTA);

    expect(editions[1]).toEqual({
      filmYear: 1953,
      ceremonyNumber: 7,
      entries: [
        {
          personName: 'John Gielgud',
          filmPage: 'Julius Caesar (1953 film)',
          filmTitle: 'Julius Caesar',
          isWinner: true,
        },
      ],
    });
  });
});

describe('parsePersonAwardWikitext の見出しと本文の列順が違う表', () => {
  it('Role 列が Film 列より前にあっても斜体のセルを作品にする', () => {
    const [edition] = parsePersonAwardWikitext(SUPPORTING_WIKITEXT, BAFTA);

    expect(edition.entries).toEqual([
      {
        personName: 'Colin Welland',
        filmPage: 'Kes (film)',
        filmTitle: 'Kes',
        isWinner: true,
      },
      {
        personName: 'Bernard Cribbins',
        filmPage: 'The Railway Children (1970 film)',
        filmTitle: 'The Railway Children',
        isWinner: false,
      },
    ]);
  });

  it('Not awarded の回は回に含めない', () => {
    const editions = parsePersonAwardWikitext(SUPPORTING_WIKITEXT, BAFTA);

    expect(editions.map(edition => edition.ceremonyNumber)).toEqual([24, 36]);
  });

  it('同点の注記と ref label を人名から除く', () => {
    const editions = parsePersonAwardWikitext(SUPPORTING_WIKITEXT, BAFTA);

    expect(editions[1].entries[0].personName).toBe('Rohini Hattangadi');
  });
});

describe('parseFilmAwardWikitext', () => {
  it('人物列の無い表から作品だけを読む', () => {
    const editions = parseFilmAwardWikitext(FILM_WIKITEXT, BAFTA);

    expect(editions[0]).toEqual({
      filmYear: 1947,
      ceremonyNumber: 1,
      entries: [
        {
          filmPage: 'The Best Years of Our Lives',
          filmTitle: 'The Best Years of Our Lives',
          isWinner: true,
        },
      ],
    });
  });

  it('作品セルの記事名と表示名を分け、括弧の原題は捨てる', () => {
    const [, edition] = parseFilmAwardWikitext(FILM_WIKITEXT, BAFTA);

    expect(edition.entries.slice(0, 3)).toEqual([
      {filmPage: 'Hamlet (1948 film)', filmTitle: 'Hamlet', isWinner: true},
      {filmPage: 'Crossfire (film)', filmTitle: 'Crossfire', isWinner: false},
      {filmPage: 'Paisà', filmTitle: 'Paisan', isWinner: false},
    ]);
  });

  it('{{Lang}} で包まれた作品リンクを読む', () => {
    const [, edition] = parseFilmAwardWikitext(FILM_WIKITEXT, BAFTA);

    expect(edition.entries[3]).toEqual({
      filmPage: 'Pather Panchali (film)',
      filmTitle: 'Pather Panchali',
      isWinner: false,
    });
  });
});

const GOLDEN_GLOBE = {
  ceremonyPage: 'Golden Globe Awards',
  winnerBackground: /background:\s*#b0c4de/i,
};

const GLOBE_ACTOR_WIKITEXT = `
==Winners and nominees==
===2020s===
{| class="wikitable sortable"
!scope="col" style="width:8%;"| Year
!scope="col" style="width:30%;"| Actor
!scope="col" style="width:30%;"| Role(s)
!scope="col" style="width:30%;"| Film
!scope="col" style="width:2%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
! rowspan="4" style="text-align:center;" |[[78th Golden Globe Awards|2020]]
| style="background:#B0C4DE;" | '''[[Chadwick Boseman]] <small>(posthumous)</small>''' || style="background:#B0C4DE;" | '''Levee Green''' || style="background:#B0C4DE;" | '''''[[Ma Rainey's Black Bottom (film)|Ma Rainey's Black Bottom]]'''''
| rowspan=4|<ref>{{cite web|url=https://example.com/|title=Winners}}</ref>
|-
| [[Riz Ahmed]] || Ruben Stone || ''[[Sound of Metal]]''
|-
| [[Gary Oldman]] || [[Herman J. Mankiewicz]] || ''[[Mank]]''
|-
| [[Howard Rollins|Howard E. Rollins, Jr.]] || Coalhouse Walker, Jr. || ''[[Ragtime (film)|Ragtime]]''
|}

==Multiple nominations==
`;

const GLOBE_ACTRESS_WIKITEXT = `
==Winners and nominees==
===1980s===
{| class="wikitable sortable"
!scope="col" style="width:8%;"| Year
!scope="col" style="width:30%;"| Actress
!scope="col" style="width:30%;"| Role(s)
!scope="col" style="width:30%;"| Film
!scope="col" style="width:2%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
! rowspan="2" style="text-align:center;" | [[Golden Globe Awards 1980|1980]] <Br /> <small>([[38th Golden Globe Awards|38th]])</small> 
| style="background:#B0C4DE;" | '''[[Sissy Spacek]]''' † || style="background:#B0C4DE;" | '''[[Loretta Lynn]]''' || style="background:#B0C4DE;" | '''''[[Coal Miner's Daughter (film)|Coal Miner's Daughter]]''''' || rowspan=2|<ref>{{cite web|url=https://example.com/|title=Winners}}</ref>
|-
| [[Irene Cara]] || Coco Hernandez || ''[[Fame (1980 film)|Fame]]''
|}
`;

const GLOBE_DRAMA_WIKITEXT = `
== Winners and Nominees ==
=== 1940s ===
{| class="wikitable sortable" style="width:100%; text-align:left"
|-
! style="width:6%;" | Year
! style="width:38%;" | Film
! style="width:30%;" | Director<ref name="onlyfirstD">When there is more than one director, only the first billed is displayed.</ref>
! style="width:30%;" | Producer/s<ref name="onlyfirstP" />
|-
! rowspan="2" style="text-align:center;" | [[7th Golden Globe Awards|1949]]
| style="background:#B0C4DE;" | '''''[[All the King's Men (1949 film)|All the King's Men]]'''''  || style="background:#B0C4DE;" | '''[[Robert Rossen]]''' || style="background:#B0C4DE;" | '''[[Robert Rossen]]'''
|-
|''[[Come to the Stable]]'' || [[Henry Koster]] || [[Samuel G. Engel]]
|-
! style="text-align:center;" | [[11th Golden Globe Awards|1953]]

! colspan="3" style="text-align:center;" | No Award given.
|}

== Notes ==
`;

const GLOBE_SPLIT_WIKITEXT = `
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

const GLOBE_FOREIGN_WIKITEXT = `
==Winners and nominations==
=== 1950s ===
{| class="wikitable sortable"
|-bgcolor="#CCCCCC"
! width="100" |Year
! width="300" |English title
! width="300" |Original title
! width="200" |Director
! width="200" |Country
|-
! colspan="5" style="text-align:center;" bgcolor="#98FF98" | Best Foreign-Language Foreign Film
|-
! rowspan=2, align=center| [[12th Golden Globe Awards|1954]] 
| style="background:#B0C4DE;" | ''' ''[[Twenty-Four Eyes]]'' '''
| style="background:#B0C4DE;" | ''' ''Nijushi no hitomi'' '''
| style="background:#B0C4DE;" | ''' [[Keisuke Kinoshita]] ''' 
| style="background:#B0C4DE;" | ''' Japan ''' 
|-
| style="background:#B0C4DE;", colspan=2 | ''' ''[[Genevieve (film)|Genevieve]]'' '''
| style="background:#B0C4DE;" | ''' [[Henry Cornelius]] ''' 
| colspan="2" style="background:#B0C4DE;" | ''' United Kingdom '''
|}
`;

describe('ゴールデングローブ形式の個人賞の表', () => {
  it('回次リンクの表示から公開年を読む', () => {
    const editions = parsePersonAwardWikitext(
      GLOBE_ACTOR_WIKITEXT,
      GOLDEN_GLOBE,
    );

    expect(
      editions.map(edition => [edition.filmYear, edition.ceremonyNumber]),
    ).toEqual([[2020, 78]]);
  });

  it('年セルが年のリンクと回次の注記でも公開年と回次を読む', () => {
    const editions = parsePersonAwardWikitext(
      GLOBE_ACTRESS_WIKITEXT,
      GOLDEN_GLOBE,
    );

    expect(
      editions.map(edition => [
        edition.filmYear,
        edition.ceremonyNumber,
        edition.entries.map(entry => entry.personName),
      ]),
    ).toEqual([[1980, 38, ['Sissy Spacek', 'Irene Cara']]]);
  });

  it('1行に || で並んだセルを列に分け、指定した背景色を受賞にする', () => {
    const [edition] = parsePersonAwardWikitext(
      GLOBE_ACTOR_WIKITEXT,
      GOLDEN_GLOBE,
    );

    expect(edition.entries).toEqual([
      {
        personName: 'Chadwick Boseman',
        filmPage: "Ma Rainey's Black Bottom (film)",
        filmTitle: "Ma Rainey's Black Bottom",
        isWinner: true,
      },
      {
        personName: 'Riz Ahmed',
        filmPage: 'Sound of Metal',
        filmTitle: 'Sound of Metal',
        isWinner: false,
      },
      {
        personName: 'Gary Oldman',
        filmPage: 'Mank',
        filmTitle: 'Mank',
        isWinner: false,
      },
      {
        personName: 'Howard E. Rollins, Jr.',
        filmPage: 'Ragtime (film)',
        filmTitle: 'Ragtime',
        isWinner: false,
      },
    ]);
  });
});

describe('ゴールデングローブ形式の作品賞の表', () => {
  it('Winners and Nominees の大文字と |- の後の見出し行を読み、No Award の回は含めない', () => {
    const editions = parseFilmAwardWikitext(GLOBE_DRAMA_WIKITEXT, GOLDEN_GLOBE);

    expect(editions).toEqual([
      {
        filmYear: 1949,
        ceremonyNumber: 7,
        entries: [
          {
            filmPage: "All the King's Men (1949 film)",
            filmTitle: "All the King's Men",
            isWinner: true,
          },
          {
            filmPage: 'Come to the Stable',
            filmTitle: 'Come to the Stable',
            isWinner: false,
          },
        ],
      },
    ]);
  });

  it('作品列が2つある表は colspan を数えて両方の列から読む', () => {
    const editions = parseFilmAwardWikitext(GLOBE_SPLIT_WIKITEXT, {
      ...GOLDEN_GLOBE,
      winnerBackground: /background:\s*#(?:b0c4de|90ee90)/i,
      filmHeaders: ['Film', 'Comedy', 'Musical'],
    });

    expect(
      editions[0].entries.map(entry => [entry.filmTitle, entry.isWinner]),
    ).toEqual([
      ['Some Like It Hot', true],
      ['Porgy and Bess', true],
      ['Who Was That Lady?', false],
      ['Say One for Me', false],
    ]);
  });

  it('English title の列を作品にし、表中の小見出しと colspan の作品セルを読む', () => {
    const editions = parseFilmAwardWikitext(GLOBE_FOREIGN_WIKITEXT, {
      ...GOLDEN_GLOBE,
      filmHeaders: ['English title'],
    });

    expect(editions).toEqual([
      {
        filmYear: 1954,
        ceremonyNumber: 12,
        entries: [
          {
            filmPage: 'Twenty-Four Eyes',
            filmTitle: 'Twenty-Four Eyes',
            isWinner: true,
          },
          {
            filmPage: 'Genevieve (film)',
            filmTitle: 'Genevieve',
            isWinner: true,
          },
        ],
      },
    ]);
  });
});

const CANNES = {
  sectionHeading: /^==\s*Winners\s*==/im,
  ceremonyNumberOf: (year: number) => (year === 1946 ? 1 : year - 1947),
  winnersOnly: true,
  otherAwardMarker: /double dagger/,
};

const CANNES_ACTOR_WIKITEXT = `
==History==
The award was first given in 1946.

==Winners==
{| class="wikitable"
|+ Table key
|-
! scope="row" style="height:20px; width:30px" | {{double dagger|alt=Indicates the Best Supporting Actor winner}}
| Indicates the Best Supporting Actor winner
|}

=== 1940s ===
{| class="wikitable unsortable"
!scope="col" style="width:3%;" | Year
!scope="col" style="width:10%;"| Actor
!scope="col" style="width:10%;"| Role(s)
!scope="col" style="width:10%;"| Title
!scope="col" style="width:1%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
! style="text-align:center;" | [[1946 Cannes Film Festival|1946]]
| {{sortname|Ray|Milland}}
| {{sortname|Don|Birnam|nolink=1}}
| {{sort|Lost Weekend|''[[The Lost Weekend]]''}}
| style="text-align:center;"| <ref>cite</ref>
|}

=== 1970s ===
{| class="wikitable unsortable"
!scope="col" style="width:3%;" | Year
!scope="col" style="width:10%;"| Actor
!scope="col" style="width:10%;"| Role(s)
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:10%;"| Original Title
!scope="col" style="width:1%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
! rowspan="2" style="text-align:center;" | [[1979 Cannes Film Festival|1979]]
| {{sortname|Jack|Lemmon}}
| {{sortname|Jack|Godell|nolink=1}}
| colspan="2"| {{sort|China Syndrome|''[[The China Syndrome]]''}}
| rowspan="2" style="text-align:center;"| <ref>cite</ref>
|-
| {{sortname|Stefano|Madia}} {{double dagger|alt=Indicates the Best Supporting Actor winner}}
| {{sortname|Marco|Millozza|nolink=1}}
| {{sort|Dear Father|''[[Dear Father (1979 film)|Dear Father]]''}}
| ''Caro papà''
|-
! style="text-align:center;" | [[1980 Cannes Film Festival|1980]]
| {{sortname|Jack|Thompson|Jack Thompson (actor)}}
| {{sortname|Major J.F.|Thomas|nolink=1}}
| colspan="2"| {{sort|Breaker Morant|''[[Breaker Morant (film)|Breaker Morant]]''}}
| style="text-align:center;"| <ref>cite</ref>
|}

== Multiple winners ==
{| class="wikitable"
! style="text-align:center;" | [[1991 Cannes Film Festival|1991]]
| {{sortname|Samuel L.|Jackson}}
| ''[[Jackie Brown]]''
|}
`;

const CANNES_ENSEMBLE_WIKITEXT = `
==Winners==
{| class="wikitable unsortable"
!scope="col" | Year
!scope="col" | Actress
!scope="col" | Role(s)
!scope="col" | English Title
!scope="col" | Original Title
|-
! rowspan="2" style="text-align:center;" | [[2006 Cannes Film Festival|2006]]
| {{sortname|Penélope|Cruz}}
| Raimunda
| rowspan="2" colspan="2"| {{sort|Volver|''[[Volver]]''}}
|-
| {{sortname|Carmen|Maura}}
| Irene
|}
`;

describe('カンヌ国際映画祭形式の受賞者だけの表', () => {
  it('Winners 節の年リンクから年を読み、回次は年から求め、全員を受賞にする', () => {
    const editions = parsePersonAwardWikitext(CANNES_ACTOR_WIKITEXT, {
      ...CANNES,
      filmHeaders: ['Title', 'English Title'],
    });

    expect(
      editions.map(edition => [edition.filmYear, edition.ceremonyNumber]),
    ).toEqual([
      [1946, 1],
      [1979, 32],
      [1980, 33],
    ]);
    expect(editions.flatMap(edition => edition.entries)).toEqual([
      {
        personName: 'Ray Milland',
        filmPage: 'The Lost Weekend',
        filmTitle: 'The Lost Weekend',
        isWinner: true,
      },
      {
        personName: 'Jack Lemmon',
        filmPage: 'The China Syndrome',
        filmTitle: 'The China Syndrome',
        isWinner: true,
      },
      {
        personName: 'Jack Thompson',
        filmPage: 'Breaker Morant (film)',
        filmTitle: 'Breaker Morant',
        isWinner: true,
      },
    ]);
  });

  it('同じ作品から複数人が受賞した回は rowspan で人物ごとに読む', () => {
    const editions = parsePersonAwardWikitext(CANNES_ENSEMBLE_WIKITEXT, {
      ...CANNES,
      filmHeaders: ['English Title'],
    });

    expect(editions).toEqual([
      {
        filmYear: 2006,
        ceremonyNumber: 59,
        entries: [
          {
            personName: 'Penélope Cruz',
            filmPage: 'Volver',
            filmTitle: 'Volver',
            isWinner: true,
          },
          {
            personName: 'Carmen Maura',
            filmPage: 'Volver',
            filmTitle: 'Volver',
            isWinner: true,
          },
        ],
      },
    ]);
  });
});
