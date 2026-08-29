import {describe, expect, it} from 'vitest';
import {parseAwardEditions} from '../common/en-wikipedia-award';
import {VENICE_JURY_AWARDS, VENICE_JURY_SOURCE} from '../venice-jury-awards';

const GRAND_JURY_PRIZE = VENICE_JURY_AWARDS.find(
  award => award.category === 'Grand Jury Prize',
)!;
const SPECIAL_JURY_PRIZE = VENICE_JURY_AWARDS.find(
  award => award.category === 'Special Jury Prize',
)!;

const GRAND_JURY_PRIZE_ARTICLE = `
The '''Grand Jury Prize''' is an award given at the [[Venice Film Festival]].

== Winners ==

=== 1950s ===
{| class="wikitable unsortable"
!scope="col" style="width:1%;" | Year
!scope="col" style="width:10%;"| English title
!scope="col" style="width:8%;"| Original title
!scope="col" style="width:5%;"| Director
!scope="col" style="width:5%;" class="unsortable"|Production country 
|-
! style="text-align:center;" | [[12th Venice International Film Festival|1951]] 
| colspan="2" | {{sort|Streetcar Named Desire|''[[A Streetcar Named Desire (1951 film)|A Streetcar Named Desire]]''}} 
| {{sortname|Elia|Kazan}} 
| United States
|-
! rowspan="2" style="text-align:center;" | [[13th Venice International Film Festival|1952]] 
| {{sort|Curious Adventures of Mr. Wonderbird|''[[The King and the Mockingbird|The Curious Adventures of Mr. Wonderbird]]''}} 
| {{sort||''La Bergère et le Ramoneur''}}<ref>[https://example.com Animation in Europe]</ref>
| {{sortname|Paul|Grimault}} 
| France
|-
| colspan="2" | {{sort|Mandy|''[[Mandy (1952 film)|Mandy]]''}}<ref>{{Cite web |title=5 reasons to watch Mandy |url=https://example.com}}</ref>
| {{sortname|Alexander|Mackendrick}} 
| United Kingdom
|}

=== 1960s ===
{| class="wikitable unsortable"
!scope="col" style="width:1%;" | Year
!scope="col" style="width:10%;"| English title
!scope="col" style="width:8%;"| Original title
!scope="col" style="width:5%;"| Director
!scope="col" style="width:5%;" class="unsortable"|Production country 
|-
! style="text-align:center;" | [[29th Venice International Film Festival|1968]] 
| colspan="2" | {{sort|Socrate|''Le Socrate''}}
| {{sortname|Robert|Lapoujade|nolink=1}}
| France, Germany
|}

==Multiple winners==
{| class="wikitable"
! Wins !! Director
|-
| 2 || [[Marco Bellocchio]]
|}
`;

const SPECIAL_JURY_PRIZE_ARTICLE = `
The '''Special Jury Prize''' is an official award given at the [[Venice Film Festival]] since 2013.

== Winners ==

=== 2010s ===
{| class="wikitable plainrowheaders"
|-
! scope="col" | Year
! scope="col" | English Title
! scope="col" | Original Title
! scope="col" | Director(s)
! scope="col" | Production Country
! scope="col" class="unsortable" | {{Abbr|Ref.|Reference}}
|-
! style="text-align:center;" | 2013 <br />{{small|([[70th Venice International Film Festival|70th]])}}
| {{sort|Police Officer's Wife|''[[The Police Officer's Wife]]''}} 
| {{sort|Frau des Polizisten|''Die Frau des Polizisten''}} 
| {{sortname|Philip|Gröning}} 
| Germany 
| style="text-align:center;" | <ref>{{cite web |title=70. Mostra |url=https://example.com}}</ref>
|-
! style="text-align:center;" | 2014 <br />{{small|([[71st Venice International Film Festival|71st]])}}
| colspan="2" | {{sort|Sivas|''[[Sivas (film)|Sivas]]''}} 
| {{sortname|Kaan|Müjdeci}} 
| Turkey, Germany 
| style="text-align:center;" | <ref>{{cite web |title=71. Mostra |url=https://example.com}}</ref>
|}
`;

describe('審査員大賞の記事', () => {
  const editions = parseAwardEditions(
    VENICE_JURY_SOURCE,
    GRAND_JURY_PRIZE,
    GRAND_JURY_PRIZE_ARTICLE,
  );

  it('年リンクから回次を読み、Multiple winners の表は含めない', () => {
    expect(editions.map(edition => edition.ceremonyNumber)).toEqual([
      12, 13, 29,
    ]);
  });

  it('参照の付いたセルからも作品を読む', () => {
    expect(editions[1].entries.map(entry => entry.filmPage)).toEqual([
      'The King and the Mockingbird',
      'Mandy (1952 film)',
    ]);
  });

  it('リンクの無い作品は表記のまま読む', () => {
    expect(editions[2].entries).toEqual([
      {filmPage: undefined, filmTitle: 'Le Socrate', isWinner: true},
    ]);
  });
});

describe('審査員特別賞の記事', () => {
  const editions = parseAwardEditions(
    VENICE_JURY_SOURCE,
    SPECIAL_JURY_PRIZE,
    SPECIAL_JURY_PRIZE_ARTICLE,
  );

  it('回次を小さく添えた年セルから年を読み、回次は開催年から求める', () => {
    expect(editions.map(edition => edition.ceremonyNumber)).toEqual([70, 71]);
  });

  it('参照の列を無視して英題の作品を読む', () => {
    expect(editions.map(edition => edition.entries)).toEqual([
      [
        {
          filmPage: "The Police Officer's Wife",
          filmTitle: "The Police Officer's Wife",
          isWinner: true,
        },
      ],
      [{filmPage: 'Sivas (film)', filmTitle: 'Sivas', isWinner: true}],
    ]);
  });
});
