import {describe, expect, it} from 'vitest';
import {parseAcademyPersonWikitext} from '../academy-person-wikitext';

const DIRECTOR_WIKITEXT = `
==Winners and nominees==
{| class="wikitable"
| style="background:#FAEB86;" | '''Indicates the winner'''
|}

=== 1920s ===

{| class="wikitable sortable"
!scope="col" style="width:8%;"| Year
!scope="col" style="width:30%;"| Director(s)
!scope="col" style="width:30%;"| Film
!scope="col" style="width:2%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
! scope="row" rowspan=3 style="text-align:center;" | [[1927 in film|1927]]/[[1928 in film|28]] <br />{{small|[[1st Academy Awards|(1st)]]}}
| style="background:#FAEB86;" | '''{{sort|Borzage|[[Frank Borzage]]}}{{small| (Dramatic Picture)}}'''
| style="background:#FAEB86;" | '''''[[7th Heaven (1927 film)|7th Heaven]]'''''
|rowspan="2"|<ref name="Oscars1">{{cite news|url=https://www.oscars.org/oscars/ceremonies/1929|title=The 1st Academy Awards}}</ref>
|-
|{{sort|Brenon|[[Herbert Brenon]]}}{{small| (Dramatic Picture)}}
|''[[Sorrell and Son (1927 film)|Sorrell and Son]]''
|-
| {{sort|Chaplin|[[Charlie Chaplin]]}}{{small| (Comedy Picture)}}
| ''[[The Circus (1928 film)|The Circus]]''{{efn|name=circus|''[[The Circus (1928 film)|The Circus]]'' originally received a nomination, all for [[Charlie Chaplin]]. However, the [[Academy of Motion Picture Arts and Sciences|Academy]] decided to confer a [[Academy Honorary Award|Special Award]].}}
|<ref>{{cite web|url=https://example.com|title=The first Oscars}}</ref>
|-
! scope="row" rowspan=3 "style=text-align:center;" | [[1928 in film|1928]]/[[1929 in film|29]]<br />{{small|[[2nd Academy Awards|(2nd)]]}}<br />{{efn|name=2nd|The 2nd Academy Awards is the only ceremony for which there were no official nominees.}}
| style="background:#FAEB86;" | '''{{sort|Lloyd|[[Frank Lloyd]]}}'''
| style="background:#FAEB86;" | '''''{{sort|Divine|[[The Divine Lady]]}}'''''
|rowspan="3"|<ref name="Oscars2">{{cite news |url=https://www.oscars.org/oscars/ceremonies/1930 |title=The 2nd Academy Awards}}</ref>
|-
|rowspan="2"|{{sort|Lloyd|Frank Lloyd}}
|''[[Drag (1929 film)|Drag]]''
|-
|''[[Weary River]]''
|}

=== 1960s ===

{| class="wikitable sortable"
!scope="col" style="width:8%;"| Year
!scope="col" style="width:30%;"| Director(s)
!scope="col" style="width:30%;"| Film
!scope="col" style="width:2%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
!scope="row" rowspan=2 style="text-align:center;" | [[1961 in film|1961]]<br />{{small|[[34th Academy Awards|(34th)]]}}
| style="background:#FAEB86;" | '''{{sort|Wise|[[Robert Wise]]}} & {{sort|Robbins|[[Jerome Robbins]]}}'''
| style="background:#FAEB86;" | '''''[[West Side Story (1961 film)|West Side Story]]'''''
|rowspan="2"|<ref name="Oscars34">{{cite news|url=https://www.oscars.org/oscars/ceremonies/1962|title=The 34th Academy Awards}}</ref>
|-
|{{sort|Fellini|[[Federico Fellini]]}}
|''[[La Dolce Vita]]''
|}

===2000s===

{| class="wikitable sortable"
!scope="col" style="width:8%;"| Year
!scope="col" style="width:30%;"| Director(s)
!scope="col" style="width:30%;"| Film
!scope="col" style="width:2%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
! rowspan="2" |[[2007 in film|2007]]<br /><small>[[80th Academy Awards|(80th)]]</small>
| style="background:#FAEB86;" |'''{{sort|Coen|[[Coen brothers|Joel Coen and Ethan Coen]]}}'''
| style="background:#FAEB86;" |'''{{sort|No Country|''[[No Country for Old Men]]''}}'''
| rowspan="2" |<ref name="Oscars80">{{cite news|url=https://www.oscars.org/oscars/ceremonies/2008|title=The 80th Academy Awards}}</ref>
|-
||{{sort|Peele|[[Jordan Peele]]}}
|''[[Get Out]]''
|}

==Multiple wins and nominations==
{| class="wikitable sortable"
! Year
! Director(s)
! Film
|-
! rowspan="1" |[[1999 in film|1999]]<br /><small>[[72nd Academy Awards|(72nd)]]</small>
| [[Sam Mendes]]
| ''[[American Beauty (1999 film)|American Beauty]]''
|}
`;

const ACTOR_WIKITEXT = `
== Winners and nominees ==
=== 1920s ===

{| class="wikitable sortable"
!scope="col" style="width:8%;"| Year
!scope="col" style="width:30%;"| Actor
!scope="col" style="width:30%;"| Role(s)
!scope="col" style="width:30%;"| Film
!scope="col" style="width:2%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
! scope="row" rowspan=4 style="text-align:center" | [[1927 in film|1927]]/[[1928 in film|28]] <br /><small>[[1st Academy Awards|(1st)]] </small>
| rowspan=2 style="background:#FAEB86;" | '''{{sort|Jannings|[[Emil Jannings]]}} {{double dagger|alt=Award winner}}{{ref label|Jannings|A}}'''
| style="background:#FAEB86;" | '''{{sort|Alexander|Grand Duke Sergius Alexander}}'''
| style="background:#FAEB86;" | '''{{sort|Last|''[[The Last Command (1928 film)|The Last Command]]''}}'''
|rowspan=4|<ref name="Oscars1">{{cite news|url=https://www.oscars.org/oscars/ceremonies/1929|title=The 1st Academy Awards}}</ref>
|-
| style="background:#FAEB86;" | '''{{sort|Schilling|August Schilling}}'''
| style="background:#FAEB86;" | '''{{sort|Way|''[[The Way of All Flesh (1927 film)|The Way of All Flesh]]''}}'''
|-
| {{sort|Barthelmess|[[Richard Barthelmess]]}}
| {{sort|Elkins|Nickie Elkins}}
| {{sort|Noose|''[[The Noose (film)|The Noose]]''}}
|-
| {{sort|Eagels|[[Jeanne Eagels]]}} †
| {{sort|Crosbie|[[Ethel Proudlock case|Leslie Crosbie]]}}
| {{sort|Letter|''[[The Letter (1929 film)|The Letter]]''}}
|}

=== 1930s ===

{| class="wikitable sortable"
!scope="col" style="width:8%;"| Year
!scope="col" style="width:30%;"| Actor
!scope="col" style="width:30%;"| Role(s)
!scope="col" style="width:30%;"| Film
!scope="col" style="width:2%;" class="unsortable"|{{Abbr|Ref.|Reference}}
|-
! scope="row" rowspan=3 style="text-align:center" | [[1931 in film|1931]]/[[1932 in film|32]] <br /><small>[[5th Academy Awards|(5th)]] </small>
| style="background:#FAEB86;" | '''{{sort|Beery|[[Wallace Beery]]}}  <small>(Tie)</small> {{double dagger|alt=Award winner}}'''
| style="background:#FAEB86;" | '''{{sort|Purcell|Andy "Champ" Purcell}}'''
| style="background:#FAEB86;" | '''{{sort|Champ|''[[The Champ (1931 film)|The Champ]]''}}'''
|rowspan=3|<ref name="Oscars5">{{cite news|url=https://www.oscars.org/oscars/ceremonies/1933|title=The 5th Academy Awards}}</ref>
|-
| style="background:#FAEB86;" | '''{{sort|March|[[Fredric March]]}}  <small>(Tie)</small> {{double dagger|alt=Award winner}}'''
| style="background:#FAEB86;" | '''{{sort|Jekyll|[[Dr. Henry Jekyll and Mr. Edward Hyde|Dr. Henry Jekyll / Mr. Edward Hyde]]}}'''
| style="background:#FAEB86;" | '''{{sort|Jekyll|''[[Dr. Jekyll and Mr. Hyde (1931 film)|Dr. Jekyll and Mr. Hyde]]''}}'''
|-
| {{sort|Muni|[[Paul Muni]]}} <small>(Write-in)</small>
| {{sort|Radek|Joe Radek}}
| ''[[Black Fury (film)|Black Fury]]''
|}

===1930s===

{| class="wikitable sortable" style="text-align:left;"
! scope="col" style="width:8%;"  | Year
! scope="col" style="width:25%;" | Actress
! scope="col" style="width:25%;" | Role(s)
! scope="col" style="width:40%;" | Film
! scope="col" style="width:2%;" class="unsortable"| {{Abbr|Ref.|Reference}}
|-
! scope="row" rowspan=3 style="text-align:center" | [[1939 in film|1939]] <br /><small>[[12th Academy Awards|(12th)]] </small>
| style="background:#FAEB86" | '''{{sort|McDaniel|[[Hattie McDaniel]]}} {{double dagger|alt=Award winner}}'''
| style="background:#FAEB86" | '''Mammy'''
| style="background:#FAEB86" | '''''[[Gone with the Wind (film)|Gone with the Wind]]'''''
| rowspan=3| <ref name="Oscars12">{{cite web|url=https://www.oscars.org/oscars/ceremonies/1940|title=The 12th Academy Awards}}</ref>
|-
| {{sort|de Havilland|[[Olivia de Havilland]]}}
| {{sort|Hamilton|Melanie Hamilton}}
| ''Gone with the Wind''
|-
| {{sort|Ouspenskaya|[[Maria Ouspenskaya]]}}
| {{sort|Ouspenskaya|Maria Ouspenskaya}}
| ''{{sort|Love|Love Affair}}''
|}
`;

describe('parseAcademyPersonWikitext', () => {
  const editions = parseAcademyPersonWikitext(DIRECTOR_WIKITEXT);

  it('回次ごとにまとめる', () => {
    expect(
      editions.map(edition => [edition.filmYear, edition.ceremonyNumber]),
    ).toEqual([
      [1927, 1],
      [1928, 2],
      [1961, 34],
      [2007, 80],
    ]);
  });

  it('受賞者は人物セルの背景色で判定する', () => {
    expect(
      editions[0].entries.map(entry => [entry.personName, entry.isWinner]),
    ).toEqual([
      ['Frank Borzage', true],
      ['Herbert Brenon', false],
      ['Charlie Chaplin', false],
    ]);
  });

  it('作品は記事名と表示名を分ける', () => {
    expect(editions[0].entries[0]).toMatchObject({
      filmPage: '7th Heaven (1927 film)',
      filmTitle: '7th Heaven',
    });
  });

  it('脚注に含まれるリンクは作品として拾わない', () => {
    expect(editions[0].entries[2]).toMatchObject({
      filmPage: 'The Circus (1928 film)',
      filmTitle: 'The Circus',
    });
  });

  it('rowspanで複数作品にまたがる人物は作品ごとに1件にする', () => {
    expect(
      editions[1].entries.map(entry => [
        entry.personName,
        entry.filmTitle,
        entry.isWinner,
      ]),
    ).toEqual([
      ['Frank Lloyd', 'The Divine Lady', true],
      ['Frank Lloyd', 'Drag', false],
      ['Frank Lloyd', 'Weary River', false],
    ]);
  });

  it('& で並ぶ共同監督は人物ごとに1件にする', () => {
    expect(
      editions[2].entries.map(entry => [entry.personName, entry.filmTitle]),
    ).toEqual([
      ['Robert Wise', 'West Side Story'],
      ['Jerome Robbins', 'West Side Story'],
      ['Federico Fellini', 'La Dolce Vita'],
    ]);
  });

  it('1つのリンクに and で並ぶ共同監督も人物ごとに1件にする', () => {
    expect(
      editions[3].entries.map(entry => [entry.personName, entry.isWinner]),
    ).toEqual([
      ['Joel Coen', true],
      ['Ethan Coen', true],
      ['Jordan Peele', false],
    ]);
  });

  it('|| で始まるセルも読める', () => {
    expect(editions[3].entries[2].filmTitle).toBe('Get Out');
  });
});

describe('parseAcademyPersonWikitext の演技賞', () => {
  const editions = parseAcademyPersonWikitext(ACTOR_WIKITEXT);

  it('役名の列を飛ばして作品を読む', () => {
    expect(
      editions[0].entries.map(entry => [entry.personName, entry.filmTitle]),
    ).toEqual([
      ['Emil Jannings', 'The Last Command'],
      ['Emil Jannings', 'The Way of All Flesh'],
      ['Richard Barthelmess', 'The Noose'],
      ['Jeanne Eagels', 'The Letter'],
    ]);
  });

  it('受賞マークと没後の印を人名から除く', () => {
    expect(editions[0].entries[0].isWinner).toBe(true);
    expect(editions[0].entries[3].personName).toBe('Jeanne Eagels');
  });

  it('リンクの無い作品は同じ回の同名作品の記事名を使う', () => {
    expect(editions[2].entries[1]).toMatchObject({
      personName: 'Olivia de Havilland',
      filmPage: 'Gone with the Wind (film)',
      filmTitle: 'Gone with the Wind',
    });
  });

  it('同じ回に同名作品が無いリンク無しの作品は記事名を持たない', () => {
    expect(editions[2].entries[2]).toMatchObject({
      filmPage: undefined,
      filmTitle: 'Love Affair',
    });
  });

  it('<small> の注記は人名から除く', () => {
    expect(editions[1].entries.map(entry => entry.personName)).toEqual([
      'Wallace Beery',
      'Fredric March',
    ]);
  });

  it('同点の受賞者は両方とも受賞にする', () => {
    expect(editions[1].entries.map(entry => entry.isWinner)).toEqual([
      true,
      true,
    ]);
  });
});
