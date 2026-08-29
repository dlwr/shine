import {describe, expect, it} from 'vitest';
import {BERLIN_JURY_AWARDS, BERLIN_JURY_SOURCE} from '../berlin-jury-awards';
import {parseAwardEditions} from '../common/en-wikipedia-award';

const GRAND_JURY_PRIZE = BERLIN_JURY_AWARDS.find(
  award => award.category === 'Silver Bear Grand Jury Prize',
)!;
const JURY_PRIZE = BERLIN_JURY_AWARDS.find(
  award => award.category === 'Silver Bear Jury Prize',
)!;

const GRAND_JURY_PRIZE_ARTICLE = `
== History ==
The award was first presented in 1965.

== Winners ==

=== 1960s ===
{| class="wikitable plainrowheaders"
|-
!scope="col" style="width:5%;" | Year
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:10%;"| Original Title
!scope="col" style="width:10%;"| Director
!scope="col" style="width:10%;" class="unsortable"| Production Country
|-
! rowspan="2" style="text-align:center;" | 1965 <br />{{small|([[15th Berlin International Film Festival|15th]])}} 
| colspan="2" | {{sort|Bonheur|''[[Le Bonheur (1965 film)|Le Bonheur]]''}} 
| {{sortname|Agnès|Varda}} 
| France
|-
| colspan="2" | {{sort|Repulsion|''[[Repulsion (film)|Repulsion]]''}} 
| {{sortname|Roman|Polanski}} 
| United Kingdom
|}

=== 1970s ===
{| class="wikitable plainrowheaders"
|-
!scope="col" style="width:5%;" | Year
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:10%;"| Original Title
!scope="col" style="width:10%;"| Director
!scope="col" style="width:10%;" class="unsortable"| Production Country
|-
! style="text-align:center;" | 1970 <br />{{small|([[20th Berlin International Film Festival|20th]])}}
! colspan="4" style="background-color:#EFD; padding-left:10%" data-sort-value="ω" | {{center|No awards given that year because of the controversy}}
|-
! style="text-align:center;" | 1971 <br />{{small|([[21st Berlin International Film Festival|21st]])}} 
| colspan="2" | {{sort|Decameron|''[[The Decameron (film)|The Decameron]]''}} 
| {{sortname|Pier Paolo|Pasolini}} 
| Italy
|}
`;

const JURY_PRIZE_ARTICLE = `
==History==
The award was introduced in 2021.

==Winners==

=== 2020s ===
{| class="wikitable plainrowheaders"
|-
! scope="col" | Year
! scope="col" | English Title
! scope="col" | Original Title
! scope="col" | Director(s)
! scope="col" | Production Country
|-
! align="center" | 2021 <br />{{small|([[71st Berlin International Film Festival|71st]])}}
| {{sort|Mr Bachmann and His Class|''Mr Bachmann and His Class''}}
| {{sort|Herr Bachmann und seine Klasse|''Herr Bachmann und seine Klasse''}}
| Maria Speth
| Germany
|-
! align="center" | 2022 <br />{{small|([[72nd Berlin International Film Festival|72nd]])}}
| {{sort|Robe of Gems|''[[Robe of Gems]]''}}
| {{sort|Manto de Gemas|''Manto de Gemas''}}
| Natalia López Gallardo
| Mexico, Argentina, United States
|}
`;

describe('銀熊賞（審査員グランプリ）の記事', () => {
  const editions = parseAwardEditions(
    BERLIN_JURY_SOURCE,
    GRAND_JURY_PRIZE,
    GRAND_JURY_PRIZE_ARTICLE,
  );

  it('年セルに小さく添えた回次リンクから回次を読む', () => {
    expect(editions.map(edition => edition.ceremonyNumber)).toEqual([15, 21]);
  });

  it('同じ回の2作受賞は rowspan で1作1件に読む', () => {
    expect(editions[0].entries.map(entry => entry.filmPage)).toEqual([
      'Le Bonheur (1965 film)',
      'Repulsion (film)',
    ]);
  });

  it('授賞の無かった回の注記の行は候補にしない', () => {
    expect(editions[1].entries).toEqual([
      {
        filmPage: 'The Decameron (film)',
        filmTitle: 'The Decameron',
        isWinner: true,
      },
    ]);
  });
});

describe('銀熊賞（審査員賞）の記事', () => {
  const editions = parseAwardEditions(
    BERLIN_JURY_SOURCE,
    JURY_PRIZE,
    JURY_PRIZE_ARTICLE,
  );

  it('リンクの無い作品は表記のまま読み、監督の列は無視する', () => {
    expect(editions[0]).toEqual({
      filmYear: 2021,
      ceremonyNumber: 71,
      entries: [
        {
          filmPage: undefined,
          filmTitle: 'Mr Bachmann and His Class',
          isWinner: true,
        },
      ],
    });
  });

  it('英題の列のリンクを作品にする', () => {
    expect(editions[1].entries).toEqual([
      {filmPage: 'Robe of Gems', filmTitle: 'Robe of Gems', isWinner: true},
    ]);
  });
});
