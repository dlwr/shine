import {describe, expect, it} from 'vitest';
import {CANNES_JURY_AWARDS} from '../cannes-jury-awards';
import {CANNES_SOURCE} from '../cannes-person-awards';
import {parseAwardEditions} from '../common/en-wikipedia-award';

const GRAND_PRIX = CANNES_JURY_AWARDS.find(
  award => award.category === 'Grand Prix',
)!;
const JURY_PRIZE = CANNES_JURY_AWARDS.find(
  award => award.category === 'Jury Prize',
)!;

const GRAND_PRIX_ARTICLE = `
==History==
The award was first presented in 1967.

== Winners ==
[[File:Bruno Dumont Cannes 2014.jpg|thumb|120px|[[Bruno Dumont]] won twice]]

=== 1960s === 
{| class="wikitable unsortable"
!scope="col" style="width:1%;" | Year
!scope="col" style="width:10%;"| English title
!scope="col" style="width:8%;"| Original title
!scope="col" style="width:5%;"| Director
!scope="col" style="width:5%;" class="unsortable"|Production country 
|-
! rowspan="2" style="text-align:center;" | [[1967 Cannes Film Festival|1967]] 
| colspan="2" | {{sort|Accident|''[[Accident (1967 film)|Accident]]''}} 
| {{sortname|Joseph|Losey}} 
| United Kingdom
|-
| {{sort|I Even Met Happy Gypsies|''[[I Even Met Happy Gypsies]]''}} 
| {{sort|Skupljači perja|''Skupljači perja''}} 
| {{sortname|Aleksandar|Petrović|Aleksandar Petrović (film director)}} 
| Yugoslavia
|-
! style="text-align:center;" | [[1969 Cannes Film Festival|1969]] 
| colspan="2" | {{sort|Ådalen 31|''[[Ådalen 31]]''}} 
| {{sortname|Bo|Widerberg}}
| Sweden
|}

==Multiple winners==
{| class="wikitable"
! Wins !! Director
|-
| 2 || [[Bruno Dumont]]
|}
`;

const JURY_PRIZE_ARTICLE = `
==History==
The award was first presented in 1946.

==Winners==

=== 1940s ===
{| class="wikitable plainrowheaders"
|-
!scope="col" style="width:1%;" | Year
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:10%;"| Original Title
!scope="col" style="width:10%;"| Recipient(s)
!scope="col" style="width:10%;" class="unsortable" scope="col" | Production Country
|-
! style="text-align:center;" | [[1946 Cannes Film Festival|1946]] 
| {{sort|Battle of the Rails|''[[The Battle of the Rails]]''}} 
| {{sort|Bataille du rail|''La Bataille du rail''}} 
| {{sortname|René|Clément}} 
| France
|}

=== 1950s ===
{| class="wikitable plainrowheaders"
|-
!scope="col" style="width:1%;" | Year
!scope="col" style="width:10%;"| English Title
!scope="col" style="width:10%;"| Original Title
!scope="col" style="width:10%;"| Recipient(s)
!scope="col" style="width:10%;" class="unsortable" scope="col" | Production Country
|-
! style="text-align:center;" | [[1951 Cannes Film Festival|1951]] 
| colspan="2" | {{sort|All About Eve|''[[All About Eve]]''}} 
| {{sortname|Joseph L.|Mankiewicz}} 
| United States
|}
`;

describe('グランプリの記事', () => {
  const editions = parseAwardEditions(
    CANNES_SOURCE,
    GRAND_PRIX,
    GRAND_PRIX_ARTICLE,
  );

  it('年リンクから回次を読み、Multiple winners の表は含めない', () => {
    expect(editions.map(edition => edition.ceremonyNumber)).toEqual([20, 22]);
  });

  it('英題の列だけを作品にし、原題・監督・製作国の列は無視する', () => {
    expect(editions[1].entries).toEqual([
      {filmPage: 'Ådalen 31', filmTitle: 'Ådalen 31', isWinner: true},
    ]);
  });

  it('同じ回の2作受賞は rowspan で1作1件に読む', () => {
    expect(editions[0].entries.map(entry => entry.filmPage)).toEqual([
      'Accident (1967 film)',
      'I Even Met Happy Gypsies',
    ]);
  });
});

describe('審査員賞の記事', () => {
  const editions = parseAwardEditions(
    CANNES_SOURCE,
    JURY_PRIZE,
    JURY_PRIZE_ARTICLE,
  );

  it('1946年を第1回、1951年を第4回に読む', () => {
    expect(editions.map(edition => edition.ceremonyNumber)).toEqual([1, 4]);
  });

  it('Recipient(s) の列を無視して英題の作品を読む', () => {
    expect(editions[0].entries).toEqual([
      {
        filmPage: 'The Battle of the Rails',
        filmTitle: 'The Battle of the Rails',
        isWinner: true,
      },
    ]);
  });
});
