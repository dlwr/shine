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
| rowspan="3"| {{center|'''1948'''<br>{{small|([[2nd British Academy Film Awards|2nd]])}}}}
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

    expect(edition.entries).toEqual([
      {filmPage: 'Hamlet (1948 film)', filmTitle: 'Hamlet', isWinner: true},
      {filmPage: 'Crossfire (film)', filmTitle: 'Crossfire', isWinner: false},
      {filmPage: 'Paisà', filmTitle: 'Paisan', isWinner: false},
    ]);
  });
});
