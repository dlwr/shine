import {describe, expect, it} from 'vitest';
import {parseAwardEditions} from '../common/en-wikipedia-award';
import {VENICE_PERSON_AWARDS, VENICE_SOURCE} from '../venice-person-awards';

const BEST_ACTOR = VENICE_PERSON_AWARDS.find(
  award => award.category === 'Volpi Cup for Best Actor',
)!;
const BEST_DIRECTOR = VENICE_PERSON_AWARDS.find(
  award => award.category === 'Silver Lion for Best Director',
)!;

const VOLPI_CUP = `
== History ==
The festival was held for the first time in 1934.

==Winners==
{| class="wikitable"
|+ Table key
|-
! scope="row" style="height:20px; width:30px" | {{double dagger|alt=Indicates the Best Supporting Actor winner}}
| Indicates the Best Supporting Actor winner
|}

=== 1930s ===
{| class="wikitable unsortable"
!scope="col" style="width:3%;" | Year
!scope="col" style="width:10%;"| Actor
!scope="col" style="width:10%;"| Role(s)
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:10%;"| Original Title
|-
! colspan="5" | Awarded as "Best Actor"
|-
! style="text-align:center;" | [[1st Venice International Film Festival|1932]]
| {{sortname|Fredric|March}} {{ref label|Audience|A}}
| {{sortname|Dr. Henry|Jekyll / Mr. Edward Hyde|Dr. Jekyll and Mr. Hyde (character)}}
| colspan="2" | {{sort|Dr. Jekyll and Mr. Hyde|''[[Dr. Jekyll and Mr. Hyde (1931 film)|Dr. Jekyll and Mr. Hyde]]''}}
|}

=== 1950s ===
{| class="wikitable unsortable"
!scope="col" style="width:3%;" | Year
!scope="col" style="width:10%;"| Actor
!scope="col" style="width:10%;"| Role(s)
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:10%;"| Original Title
|-
! rowspan="2" style="text-align:center;" | [[15th Venice International Film Festival|1954]]
| rowspan="2" | {{sortname|Jean|Gabin}}
| Victor Le Garrec
| {{sort|Air de Paris|''[[The Air of Paris]]''}}
|''L'air de Paris''
|-
| Max
| colspan="1"| {{sort|Touchez pas au grisbi|''[[Touchez pas au grisbi|Honour Among Thieves]]''}}
| colspan="1" |''Touchez pas au grisbi''
|}

=== 1980s ===
{| class="wikitable unsortable"
!scope="col" style="width:3%;" | Year
!scope="col" style="width:10%;"| Actor
!scope="col" style="width:10%;"| Role(s)
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:10%;"| Original Title
|-
! scope="row" style="text-align:center" | [[42nd Venice International Film Festival|1985]]
! colspan="5" | Not assigned{{efn|name=fn6}}
|-
! rowspan="2" style="text-align:center;" | [[45th Venice International Film Festival|1988]]
| {{sortname|Don|Ameche}}
| Gino
| colspan="2" | {{sort|Things Change|''[[Things Change (film)|Things Change]]''}}
|-
| {{sortname|Eric|Bogosian}} {{double dagger|alt=Best Supporting Actor}}
| Barry Champlain
| colspan="2" | {{sort|Talk Radio|''[[Talk Radio (film)|Talk Radio]]''}}
|}

=== 2020s ===
{| class="wikitable unsortable"
!scope="col" style="width:3%;" | Year
!scope="col" style="width:10%;"| Actor
!scope="col" style="width:10%;"| Role(s)
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:10%;"| Original Title
|-
! style="text=aligne:center;" | [[81st Venice International Film Festival|2024]]
| [[Vincent Lindon]]
| Pierre
| ''[[The Quiet Son]]''
|''Jouer avec le feu''
|}

==Multiple winners==
{| class="wikitable" style="text-align:center;"
! scope="col" | Number of Wins
! scope="col" | Actor
|-
! 2
| [[Jean Gabin]]
|}
`;

const SILVER_LION = `
The '''Silver Lion''' is an annual award presented for best directing achievements.

== Silver Lion for Best Direction (1990–present) ==
[[File:Martin Scorsese 02 CROPPED.jpg|thumb|120px|{{sortname|Martin|Scorsese}} won for ''[[Goodfellas]]'' (1990)]]

=== 1990s ===
{| class="wikitable unsortable"
!scope="col" style="width:2%;" | Year
!scope="col" style="width:10%;"| Director
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:10%;"| Original Title
|-
! style="text-align:center;" | [[47th Venice International Film Festival|1990]]
| {{sortname|Martin|Scorsese}}
| colspan="2" | {{sort|Goodfellas|''[[Goodfellas]]''}}
|-
! style="text-align:center;" | [[56th Venice International Film Festival|1999]]
| {{sortname|Zhang|Yuan|Zhang Yuan (director)|Zhang, Yuan}}
| {{sort|Seventeen Years|''[[Seventeen Years (film)|Seventeen Years]]''}}
| {{sort|guò nián huí jiā|過年回家}}
|}

== Multiple Winners ==
{| class="wikitable" style="text-align:center;"
! scope="col" | Number of Wins
! scope="col" | Director
|-
! 2
| [[Andrei Konchalovsky]]
|}

== Defunct Categories ==
===Silver Lion Prize (1953–1994)===
{| class="wikitable"
! Year
! Director
! English Title
|-
! [[14th Venice International Film Festival|1953]]
| [[Federico Fellini]]
| ''[[I Vitelloni]]''
|}
`;

describe('ヴォルピ杯の記事', () => {
  const editions = parseAwardEditions(VENICE_SOURCE, BEST_ACTOR, VOLPI_CUP);

  it('Winners 節の年リンクから年と回次を読み、表中の小見出しは候補にしない', () => {
    expect(editions.map(edition => edition.ceremonyNumber)).toEqual([
      1, 15, 45, 81,
    ]);
    expect(editions[0].filmYear).toBe(1932);
  });

  it('Role(s) 列の人名テンプレートを役名として無視し、受賞者と作品を読む', () => {
    expect(editions[0].entries).toEqual([
      {
        personName: 'Fredric March',
        filmPage: 'Dr. Jekyll and Mr. Hyde (1931 film)',
        filmTitle: 'Dr. Jekyll and Mr. Hyde',
        isWinner: true,
      },
    ]);
  });

  it('同じ受賞者の複数作品は rowspan で作品ごとに読む', () => {
    expect(
      editions[1].entries.map(entry => [entry.personName, entry.filmPage]),
    ).toEqual([
      ['Jean Gabin', 'The Air of Paris'],
      ['Jean Gabin', 'Touchez pas au grisbi'],
    ]);
  });

  it('助演賞の印が付いた受賞者と Not assigned の回は除く', () => {
    expect(
      editions[2].entries.map(entry => [entry.personName, entry.filmPage]),
    ).toEqual([['Don Ameche', 'Things Change (film)']]);
  });

  it('英題と原題が別のセルのときは英題の列を作品にする', () => {
    expect(editions[3].entries).toEqual([
      {
        personName: 'Vincent Lindon',
        filmPage: 'The Quiet Son',
        filmTitle: 'The Quiet Son',
        isWinner: true,
      },
    ]);
  });
});

describe('銀獅子賞の記事', () => {
  const editions = parseAwardEditions(
    VENICE_SOURCE,
    BEST_DIRECTOR,
    SILVER_LION,
  );

  it('Best Direction の節だけを読み、廃止部門の表は含めない', () => {
    expect(editions.map(edition => edition.ceremonyNumber)).toEqual([47, 56]);
  });

  it('監督と作品を読む', () => {
    expect(
      editions.map(edition =>
        edition.entries.map(entry => [entry.personName, entry.filmPage]),
      ),
    ).toEqual([
      [['Martin Scorsese', 'Goodfellas']],
      [['Zhang Yuan', 'Seventeen Years (film)']],
    ]);
  });
});
