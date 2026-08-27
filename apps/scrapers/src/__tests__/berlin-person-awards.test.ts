import {describe, expect, it} from 'vitest';
import {parseAwardEditions} from '../common/en-wikipedia-award';
import {BERLIN_PERSON_AWARDS, BERLIN_SOURCE} from '../berlin-person-awards';

const BEST_DIRECTOR = BERLIN_PERSON_AWARDS.find(
  award => award.category === 'Silver Bear for Best Director',
)!;
const BEST_ACTOR = BERLIN_PERSON_AWARDS.find(
  award => award.category === 'Silver Bear for Best Actor',
)!;
const BEST_ACTRESS = BERLIN_PERSON_AWARDS.find(
  award => award.category === 'Silver Bear for Best Actress',
)!;
const BEST_SUPPORTING = BERLIN_PERSON_AWARDS.find(
  award => award.category === 'Silver Bear for Best Supporting Performance',
)!;

const BEST_DIRECTOR_ARTICLE = `
==History==
The award was first presented in 1956.

==Winners==
[[File:Kinema-Junpo-1960-February-late-4.jpg|thumb|right|120px|[[Akira Kurosawa]] won for ''[[The Hidden Fortress]]'' (1956)]]

=== 1950s ===
{| class="wikitable unsortable"
!scope="col" style="width:2%;" | Year
!scope="col" style="width:10%;"| Director
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:10%;"| Original Title
|-
! style="text-align:center;" | [[6th Berlin International Film Festival|1956]] 
| {{sortname|Robert|Aldrich}} 
| colspan="2" | {{sort|Autumn Leaves|''[[Autumn Leaves (film)|Autumn Leaves]]''}}  
|-
! style="text-align:center;" | [[8th Berlin International Film Festival|1958]] 
| {{sortname|Tadashi|Imai}} 
| {{sort|Jun'ai Monogatari|''[[Jun'ai Monogatari]]''}} 
| {{sort|Jun'ai Monogatari|{{Lang|ja|純愛物語|italic=no}}}}  
|-
! style="text-align:center;" | [[9th Berlin International Film Festival|1959]] 
| {{sortname|Akira|Kurosawa}} 
| {{sort|Hidden Fortress|''[[The Hidden Fortress]]''}}<ref>[https://movieweb.com/samurai-movies/ Best Samurai Movies of All Time, Ranked - MovieWeb]</ref>
| {{sort|Kakushi toride no san akunin|{{Lang|ja|隠し砦の三悪人|italic=no}}}} 
|}

=== 1980s ===
{| class="wikitable unsortable"
!scope="col" style="width:2%;" | Year
!scope="col" style="width:10%;"| Director
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:10%;"| Original Title
|-
! rowspan="2" style="text-align:center;" | [[34th Berlin International Film Festival|1984]] 
| {{sortname|Costas|Ferris}} 
| {{sort|Rembetiko|''[[Rembetiko (film)|Rembetiko]]''}} 
| {{sort|Ρεμπέτικο|''Ρεμπέτικο''}} 
|-
| {{sortname|Ettore|Scola}} 
| {{sort|Bal|''[[Le Bal (1983 film)|Le Bal]]''}} 
| {{sort|Ballando ballando|''Ballando ballando''}} 
|}

=== 2020s ===
{| class="wikitable unsortable"
!scope="col" style="width:2%;" | Year
!scope="col" style="width:10%;"| Director
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:10%;"| Original Title
!scope="col" style="width:1%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
! style="text-align:center;" | [[70th Berlin International Film Festival|2020]]
| {{sortname|Hong|Sang-soo||Hong, Sang-soo}}  
| {{sort|Woman Who Ran|''[[The Woman Who Ran]]''}}
| {{sort|Domangchin yeoja|도망친 여자}}
| style="text-align:center;" | <ref>[https://m-en.yna.co.kr/view/AEN20220119009500315 Hong Sang-soo's latest film]</ref> 
|-
! style="text-align:center;" | [[74th Berlin International Film Festival|2024]]
|  Nelson Carlo De Los Santos Arias
| colspan="3" |''[[Pepe (2024 Dominican film)|Pepe]]''
|-
![[75th Berlin International Film Festival|2025]]
| Huo Meng
|''[[Living the Land]]''
|生息之地
|<ref>{{Cite web |title=The Prizes of the International Jury |url=https://www.berlinale.de/ |access-date=2025-02-22}}</ref>
|}

==Multiple winners==
{| class="wikitable" style="text-align:center;"
! scope="col" | Number of Wins
! scope="col" | Director
|-
! rowspan="3" | 2
| [[Satyajit Ray]]
|}
`;

const BEST_ACTOR_ARTICLE = `
==History==
The award was first presented in 1956.

==Winners==
=== 1950s === 
{| class="wikitable unsortable"
!scope="col" style="width:3%;" | Year
!scope="col" style="width:10%;"| Actor
!scope="col" style="width:10%;"| Role(s)
!scope="col" style="width:10%;"| Title
!scope="col" style="width:1%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
! scope="row", style="text-align:center"| [[6th Berlin International Film Festival|1956]] 
|  {{sortname|Burt|Lancaster}} 
| {{sortname|Mike|Ribble|nolink=1}} 
| colspan="1" | {{sort|Trapeze|''[[Trapeze (film)|Trapeze]]''}} 
| style="text-align:center;" | <ref>{{cite web|title=6th Berlin International Film Festival – Prizes & Honours 1956|url=https://www.berlinale.de/}}</ref>
|-
|}

=== 2010s ===
{| class="wikitable unsortable"
!scope="col" style="width:3%;" | Year
!scope="col" style="width:10%;"| Actor
!scope="col" style="width:10%;"| Role(s)
!scope="col" style="width:10%;"| Title
!scope="col" style="width:1%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
! scope="row", rowspan="4" style="text-align:center;" | [[61st Berlin International Film Festival|2011]] 
|   {{sortname|Payman|Maadi}} {{ref label|Cast|A}} 
| Nader 
| rowspan="4" | {{sort|Separation|''[[A Separation]]''}} 
| rowspan="4" style="text-align:center;" | <ref>{{cite web|title=61st Berlin International Film Festival – Prizes & Honours 2011|url=https://www.berlinale.de/}}</ref>
|-
|  {{sortname|Shahab|Hosseini}} {{ref label|Cast|A}} 
| Hodjat 
|-
|  {{sortname|Ali-Asghar|Shahbazi}} {{ref label|Cast|A}} 
| Nader's Father 
|-
|   {{sortname|Babak|Karimi}} {{ref label|Cast|A}} 
| Judge 
|-
! scope="row", style="text-align:center;" | [[62nd Berlin International Film Festival|2012]] 
|  {{sortname|Mikkel Boe|Følsgaard}} 
| {{sort|Christian VII of Denmark|[[Christian VII of Denmark|King Christian VII of Denmark]]}} 
| {{sort|Royal Affair|''[[A Royal Affair]]''}} 
| style="text-align:center;" | <ref>{{cite web|title=62nd Berlin International Film Festival – Prizes & Honours 2012|url=https://www.berlinale.de/}}</ref>
|}

== Multiple winners ==
{| class="wikitable" style="text-align:center;"
! scope="col" | Wins
! scope="col" | Actor
! scope="col" | Nationality
! scope="col" | Films
|-
| rowspan="4"| 2
| [[Sidney Poitier]]
| United States
| ''[[The Defiant Ones]]'' (1958)
|}
`;

const BEST_ACTRESS_ARTICLE = `
==Winners==
=== 1960s ===
{| class="wikitable unsortable"
!scope="col" style="width:3%;" | Year
!scope="col" style="width:10%;"| Actress
!scope="col" style="width:10%;"| Role(s)
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:1%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
! scope="row", rowspan="2" style="text-align:center;" | [[14th Berlin International Film Festival|1964]]
| rowspan=2| {{sortname|Sachiko|Hidari}} {{ref label|Multiple|A}} 
| {{sortname|Tome|Matsuki|nolink=1}} 
| {{sort|Insect Woman|''[[The Insect Woman]]''}} 
| rowspan="2" style="text-align:center;" | <ref>{{cite web|title=14th Berlin International Film Festival – Prizes & Honours 1964|url=https://www.berlinale.de/}}</ref>
|- 
| {{sortname|Naoko|Ishikawa|nolink=1}}  
| {{sort|She and He|''[[She and He (1963 film)|She and He]]''}} 
|}

=== 1970s ===
{| class="wikitable unsortable"
!scope="col" style="width:3%;" | Year
!scope="col" style="width:10%;"| Actress
!scope="col" style="width:10%;"| Role(s)
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:1%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
! scope="row", rowspan=2, style="text-align:center"| [[21st Berlin International Film Festival|1971]]
|  {{sortname|Shirley|MacLaine}} 
| {{sortname|Sophie|Bentwood|nolink=1}} 
| colspan="1" | {{sort|Desperate Characters|''[[Desperate Characters (film)|Desperate Characters]]''}}  
| rowspan="2" style="text-align:center;" |<ref>{{cite web|title=21st Berlin International Film Festival – Prizes & Honours 1971|url=https://www.berlinale.de/}}</ref>
|-
|  {{sortname|Simone|Signoret}} 
| {{sortname|Clémence|Bouin|nolink=1}} 
| colspan="1" | {{sort|Chat|''[[Le Chat (film)|Le Chat]]''}} 
|}
`;

const BEST_SUPPORTING_ARTICLE = `
== History ==
The award was first presented in 2021.

==Winners==
[[File:Emily Watson at Berlinale 2024 (cropped).jpg|thumb|right|153x153px|[[Emily Watson]] won for ''[[Small Things Like These (film)|Small Things Like These]]'' (2024).]]

===2020s===
{| class="wikitable unsortable"
! scope="col" style="width:5%;" | Year
! scope="col" style="width:20%;"| Actress
! scope="col" style="width:20%;"| Role
! scope="col" style="width:25%;"| English Title
! scope="col" style="width:25%;"| Original Title
! scope="col" style="width:5%;" class="unsortable"| {{Abbr|Ref.|Reference}}
|-
! style="text-align:center;"| [[71st Berlin International Film Festival|2021]]
| {{sortname|Lilla|Kizlinger|nolink=1}}
| Unnamed teenager girl
| {{sort|Forest – I See You Everywhere|''[[Forest – I See You Everywhere]]''}}
| ''Rengeteg – mindenhol látlak''
| style="text-align:center;"| <ref>{{cite web |title=Awards & Honours 2021 |url=https://www.berlinale.de/}}</ref>
|-
! [[75th Berlin International Film Festival|2025]]
| [[Andrew Scott (actor)|Andrew Scott]]
| [[Richard Rodgers]]
| colspan="2" | ''[[Blue Moon (2025 film)|Blue Moon]]''
| style="text-align:center;"| <ref>{{cite web |url=https://deadline.com/ |title=Berlin Film Festival}}</ref>
|-
!rowspan=2| [[76th Berlin International Film Festival|2026]]
| [[Tom Courtenay]]
| Martin
|rowspan=2 colspan=2 | ''[[Queen at Sea]]''
|rowspan=2 style="text-align:center;"| <ref>{{cite web|title=Berlin Film Festival|url=https://variety.com/}}</ref>
|-
| [[Anna Calder-Marshall]]
| Leslie
|}
`;

describe('銀熊賞（監督賞）の記事', () => {
  const editions = parseAwardEditions(
    BERLIN_SOURCE,
    BEST_DIRECTOR,
    BEST_DIRECTOR_ARTICLE,
  );

  it('年セルの回次リンクから回次を読み、Multiple winners の表は含めない', () => {
    expect(editions.map(edition => edition.ceremonyNumber)).toEqual([
      6, 8, 9, 34, 70, 74, 75,
    ]);
    expect(editions[0].filmYear).toBe(1956);
  });

  it('監督と英題の列の作品を読み、原題の列と参照は無視する', () => {
    expect(
      editions
        .slice(0, 3)
        .map(edition =>
          edition.entries.map(entry => [entry.personName, entry.filmPage]),
        ),
    ).toEqual([
      [['Robert Aldrich', 'Autumn Leaves (film)']],
      [['Tadashi Imai', "Jun'ai Monogatari"]],
      [['Akira Kurosawa', 'The Hidden Fortress']],
    ]);
  });

  it('同じ回の2人受賞は rowspan で1人1行に読む', () => {
    expect(
      editions[3].entries.map(entry => [entry.personName, entry.filmPage]),
    ).toEqual([
      ['Costas Ferris', 'Rembetiko (film)'],
      ['Ettore Scola', 'Le Bal (1983 film)'],
    ]);
  });

  it('リンクの無い人名と、参照の列まで結合された作品セルを読む', () => {
    expect(
      editions
        .slice(4)
        .map(edition =>
          edition.entries.map(entry => [entry.personName, entry.filmPage]),
        ),
    ).toEqual([
      [['Hong Sang-soo', 'The Woman Who Ran']],
      [['Nelson Carlo De Los Santos Arias', 'Pepe (2024 Dominican film)']],
      [['Huo Meng', 'Living the Land']],
    ]);
  });

  it('受賞者だけの記事なので全員受賞', () => {
    expect(
      editions
        .flatMap(edition => edition.entries)
        .every(entry => entry.isWinner),
    ).toBe(true);
  });
});

describe('銀熊賞（男優賞）の記事', () => {
  const editions = parseAwardEditions(
    BERLIN_SOURCE,
    BEST_ACTOR,
    BEST_ACTOR_ARTICLE,
  );

  it('カンマ区切りの属性が付いた年セルから回次を読む', () => {
    expect(editions.map(edition => edition.ceremonyNumber)).toEqual([
      6, 61, 62,
    ]);
  });

  it('役名の列を無視して俳優と作品を読む', () => {
    expect(editions[0].entries).toEqual([
      {
        personName: 'Burt Lancaster',
        filmPage: 'Trapeze (film)',
        filmTitle: 'Trapeze',
        isWinner: true,
      },
    ]);
  });

  it('同じ作品の複数受賞は rowspan で1人1行に読み、脚注の印は落とす', () => {
    expect(
      editions[1].entries.map(entry => [entry.personName, entry.filmPage]),
    ).toEqual([
      ['Payman Maadi', 'A Separation'],
      ['Shahab Hosseini', 'A Separation'],
      ['Ali-Asghar Shahbazi', 'A Separation'],
      ['Babak Karimi', 'A Separation'],
    ]);
  });

  it('役名がリンクでも作品の列を作品にする', () => {
    expect(editions[2].entries[0]).toMatchObject({
      personName: 'Mikkel Boe Følsgaard',
      filmPage: 'A Royal Affair',
    });
  });
});

describe('銀熊賞（女優賞）の記事', () => {
  const editions = parseAwardEditions(
    BERLIN_SOURCE,
    BEST_ACTRESS,
    BEST_ACTRESS_ARTICLE,
  );

  it('同じ受賞者の複数作品は rowspan で作品ごとに読む', () => {
    expect(
      editions[0].entries.map(entry => [entry.personName, entry.filmPage]),
    ).toEqual([
      ['Sachiko Hidari', 'The Insect Woman'],
      ['Sachiko Hidari', 'She and He (1963 film)'],
    ]);
  });

  it('rowspan の後にカンマが続く年セルでも2人を同じ回に読む', () => {
    expect(editions[1].ceremonyNumber).toBe(21);
    expect(editions[1].entries.map(entry => entry.personName)).toEqual([
      'Shirley MacLaine',
      'Simone Signoret',
    ]);
  });
});

describe('銀熊賞（助演俳優賞）の記事', () => {
  const editions = parseAwardEditions(
    BERLIN_SOURCE,
    BEST_SUPPORTING,
    BEST_SUPPORTING_ARTICLE,
  );

  it('Actress 見出しの列を受賞者とし、Role 列と原題の列は無視する', () => {
    expect(editions[0].entries).toEqual([
      {
        personName: 'Lilla Kizlinger',
        filmPage: 'Forest – I See You Everywhere',
        filmTitle: 'Forest – I See You Everywhere',
        isWinner: true,
      },
    ]);
  });

  it('リンクの表示名を人名にする', () => {
    expect(editions[1].entries[0]).toMatchObject({
      personName: 'Andrew Scott',
      filmPage: 'Blue Moon (2025 film)',
    });
  });

  it('引用符の無い rowspan で同じ作品の2人を読む', () => {
    expect(
      editions[2].entries.map(entry => [entry.personName, entry.filmPage]),
    ).toEqual([
      ['Tom Courtenay', 'Queen at Sea'],
      ['Anna Calder-Marshall', 'Queen at Sea'],
    ]);
  });
});
