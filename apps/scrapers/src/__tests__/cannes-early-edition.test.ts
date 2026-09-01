import {describe, expect, it} from 'vitest';
import {parseEarlyEditionEntries} from '../cannes-early-edition';

const ARTICLE_1946 = `
== Jury ==
* [[Georges Huisman]], President

==Competition==
The following films competed for the Grand Prix:<ref name="selection">{{cite web|url=https://example.com}}</ref>
{{Div col|colwidth=30em}}
* ''[[The Adventurous Bachelor]]'' by [[Otakar Vávra]]
* ''[[Brief Encounter]]'' by [[David Lean]]
* ''[[María Candelaria]]'' by [[Emilio Fernández]]
* ''[[Pastoral Symphony (film)|Pastoral Symphony
]]'' by [[Jean Delannoy]]
* ''[[The Red Meadows]]'' by [[Bodil Ipsen]] and [[Lau Lauritzen Jr.]]
{{div col end}}

==Short films==
{{Div col|colwidth=30em}}
* ''A City Sings'' by [[Gudrun Parker]]
{{div col end}}

==Awards==
===Official awards===
'''Feature Films'''
*[[Palme d'Or|Grand Prix du Festival International du Film]]:
**''[[Brief Encounter]]'' by [[David Lean]]
**''[[María Candelaria]]'' by [[Emilio Fernández]]
**''[[La symphonie pastorale]]'' by [[Jean Delannoy]]<ref name="awards" />
*[[Jury Prize (Cannes Film Festival)|International Jury Prize]]: ''[[La Bataille du rail]]'' by [[René Clément]]
*[[Best Actor Award (Cannes Film Festival)|Best Actor]]: [[Ray Milland]] for ''[[The Lost Weekend]]''
'''Short Films'''<ref name="awards" />
*''[[Vánoční sen]]'' by [[Karel Zeman]]

===Independent awards===
'''[[FIPRESCI|FIPRESCI Prize]]'''
* ''Farrebique'' by [[Georges Rouquier]]

==References==
`;

describe('1946年の記事', () => {
  const entries = parseEarlyEditionEntries(ARTICLE_1946);

  it('コンペティション部門の箇条書きを読む', () => {
    expect(entries.map(entry => entry.filmPage)).toEqual(
      expect.arrayContaining([
        'The Adventurous Bachelor',
        'Brief Encounter',
        'María Candelaria',
        'Pastoral Symphony (film)',
        'The Red Meadows',
      ]),
    );
  });

  it('短編部門を混ぜない', () => {
    expect(entries.map(entry => entry.filmTitle)).not.toContain('A City Sings');
  });

  it('リンクの途中で改行する記事名を1件として読む', () => {
    expect(
      entries.filter(entry => entry.filmPage === 'Pastoral Symphony (film)'),
    ).toHaveLength(1);
  });

  it('グランプリのサブ箇条書きを受賞にする', () => {
    expect(
      entries.filter(entry => entry.isWinner).map(entry => entry.filmPage),
    ).toEqual([
      'Brief Encounter',
      'María Candelaria',
      'La symphonie pastorale',
    ]);
  });

  it('審査員賞・個人賞を受賞にしない', () => {
    expect(entries.map(entry => entry.filmPage)).not.toContain(
      'La Bataille du rail',
    );
  });

  it('受賞作を先に並べる', () => {
    expect(entries.slice(0, 3).every(entry => entry.isWinner)).toBe(true);
  });
});

const ARTICLE_1947 = `
==Films in competition==
{{Div col|colwidth=30em}}
* ''[[Antoine and Antoinette|Antoine et Antoinette]]'' by [[Jacques Becker]]
* ''[[Dumbo]]'' by [[Ben Sharpsteen]]
{{div col end}}

== Awards ==
'''Feature Films'''
*Best Musical Comedy: ''[[Ziegfeld Follies (film)|Ziegfeld Follies]]'' by [[Vincente Minnelli]] (''Grand Prix – Comédies musicales'')
*Best Animation Design: ''[[Dumbo]]'' by [[Ben Sharpsteen]] (''Grand Prix – Dessin animé'')

'''Short Films'''
*Best Short Film: ''[[Inondations en Pologne]]'' by [[Jerzy Bossak]] (''Grand Prix – Documentaires'')

==References==
`;

describe('部門ごとにグランプリを出した1947年の記事', () => {
  const entries = parseEarlyEditionEntries(ARTICLE_1947);

  it('部門ごとの受賞作をすべて受賞にする', () => {
    expect(
      entries.filter(entry => entry.isWinner).map(entry => entry.filmPage),
    ).toEqual(['Ziegfeld Follies (film)', 'Dumbo']);
  });

  it('部門名をnotesに残す', () => {
    expect(
      entries.filter(entry => entry.isWinner).map(entry => entry.notes),
    ).toEqual(['Best Musical Comedy', 'Best Animation Design']);
  });

  it('短編部門のグランプリを混ぜない', () => {
    expect(entries.map(entry => entry.filmPage)).not.toContain(
      'Inondations en Pologne',
    );
  });
});

const ARTICLE_1949 = `
==Feature film competition==
{{Div col|colwidth=30em}}
* ''[[Act of Violence]]'' directed by [[Fred Zinnemann]]
* ''[[Bitter Rice]]'' (''Riso amaro'') directed by [[Giuseppe De Santis]]
* ''[[The Third Man]]'' directed by [[Carol Reed]]
{{div col end}}

==Out of competition==
* ''[[Passport to Pimlico]]'' directed by [[O. H. Cornelius]]

== Awards ==
===Official awards===
'''Feature Films'''
*[[Palme d'Or|Grand Prix]]: ''[[The Third Man]]'' by [[Carol Reed]]
*[[Best Director Award (Cannes Film Festival)|Best Director]]: [[René Clément]] for ''[[The Walls of Malapaga]]''
'''Short Film awards'''
* Prize for Best Subject: ''[[Palle Alene i Verden]]'' by [[Astrid Henning-Jensen]]

==References==
`;

describe('1949年の記事', () => {
  const entries = parseEarlyEditionEntries(ARTICLE_1949);

  it('コンペティション部門の箇条書きを読む', () => {
    expect(entries.map(entry => entry.filmPage)).toEqual([
      'The Third Man',
      'Act of Violence',
      'Bitter Rice',
    ]);
  });

  it('コンペ外の上映作を混ぜない', () => {
    expect(entries.map(entry => entry.filmPage)).not.toContain(
      'Passport to Pimlico',
    );
  });

  it('同じ行に載るグランプリを受賞にする', () => {
    expect(
      entries.filter(entry => entry.isWinner).map(entry => entry.filmPage),
    ).toEqual(['The Third Man']);
  });
});

describe('読めない記事', () => {
  it('コンペティション部門の節が無ければ空にする', () => {
    expect(parseEarlyEditionEntries('== Jury ==\n* [[Someone]]')).toEqual([]);
  });
});
