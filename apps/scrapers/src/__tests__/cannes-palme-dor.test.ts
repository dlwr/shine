import {describe, expect, it} from 'vitest';
import {parseCompetitionEntries, toCompetitionData} from '../cannes-palme-dor';

const ARTICLE = `
== Official Selection ==
The Official Selection for the 79th edition was announced on 9 April 2026.

=== In Competition ===
The following films were selected to compete for the [[Palme d'Or]]:<ref name=":0">{{Cite web |title=Cannes unveils 2026 Official Selection}}</ref>

{| class="wikitable"
! scope="col" style="width:25%;" | English Title
! scope="col" style="width:25%;" | Original Title
! scope="col" style="width:25%;" | Director(s)
! scope="col" style="width:25%;" | Production Country
|-
|''[[All of a Sudden (2026 film)|All of a Sudden]]''
|{{lang|fr|Soudain}} / {{lang|ja|急に具合が悪くなる}}
|[[Ryusuke Hamaguchi]]
|France, Japan
|-
|''[[Another Day (2026 film)|Another Day]]'' <small>(QP)</small>
|{{lang|fr|Garance}}
|[[Jeanne Herry]]
|France
|-
| colspan="2" | {{lang|es|[[La bola negra]]}} <small>(QP)</small>
|[[Javier Calvo (actor)|Javier Calvo]] and [[Javier Ambrossi]]
|Spain, France
|-style="background:#FFDEAD;"
| colspan="2" |'''''[[Fjord (film)|Fjord]]'''''
|'''[[Cristian Mungiu]]'''
|'''Romania, Norway'''
|-
| colspan="2", | {{lang|fr|[[Moulin (2026 film)|Moulin]]}}
|[[László Nemes]]
|France
|}
: '''<small>(QP)</small>''' indicates film in competition for the [[Queer Palm]].

=== Out of Competition ===
{| class="wikitable"
!scope="col" style="width:25%;"| English Title
!scope="col" style="width:25%;"| Original Title
!scope="col" style="width:25%;"| Director(s)
!scope="col" style="width:25%;"| Production Country
|-
|''[[Crescendo (2026 film)|Crescendo]]''
|{{lang|fr|L'Objet du Délit}}
|[[Agnès Jaoui]]
|France
|}
`;

describe('コンペティション部門の表', () => {
  const entries = parseCompetitionEntries(ARTICLE);

  it('In Competition の表の作品だけを読む', () => {
    expect(entries.map(entry => entry.filmTitle)).toEqual([
      'All of a Sudden',
      'Another Day',
      'La bola negra',
      'Fjord',
      'Moulin',
    ]);
  });

  it('記事名を同定のキーとして読む', () => {
    expect(entries.map(entry => entry.filmPage)).toEqual([
      'All of a Sudden (2026 film)',
      'Another Day (2026 film)',
      'La bola negra',
      'Fjord (film)',
      'Moulin (2026 film)',
    ]);
  });

  it('背景色の付いた行だけを受賞にする', () => {
    expect(entries.filter(entry => entry.isWinner)).toEqual([
      {filmPage: 'Fjord (film)', filmTitle: 'Fjord', isWinner: true},
    ]);
  });
});

const JURY_SECTION = `
== Juries ==
=== Main competition ===
{| class="wikitable"
! Name
! Profession
|-
|[[George Miller (filmmaker)|George Miller]]
|Director
|}
`;

describe('審査員の節と同じ見出しを使う記事', () => {
  const entries = parseCompetitionEntries(
    JURY_SECTION +
      ARTICLE.replace('=== In Competition ===', '=== Main Competition ==='),
  );

  it('作品の表を持つ節まで探す', () => {
    expect(entries).toHaveLength(5);
  });
});

describe('コンペティション部門の取り込みデータ', () => {
  const entries = parseCompetitionEntries(ARTICLE);
  const resolved = new Map([
    ['Fjord (film)', {imdbId: 'tt30000001', englishTitle: 'Fjord'}],
    ['Moulin (2026 film)', {imdbId: 'tt30000002'}],
  ]);
  const [edition] = toCompetitionData(2026, entries, resolved).editions;
  const nominations = edition.targetAward[0].categories[0].nominations;

  it('同定できた作品だけをノミネーションにする', () => {
    expect(nominations.map(nomination => nomination.titles[0].imdbId)).toEqual([
      'tt30000001',
      'tt30000002',
    ]);
  });

  it('映画祭の開催年を回の年にする', () => {
    expect(edition.year).toBe(2026);
  });

  it('受賞作の受賞フラグを立てる', () => {
    expect(nominations.map(nomination => nomination.isWinner)).toEqual([
      true,
      false,
    ]);
  });
});
