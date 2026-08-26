import {describe, expect, it} from 'vitest';
import {cellsOf, fillRow, parseCell} from '../common/wikitext-table';

describe('parseCell', () => {
  it('属性と内容を分ける', () => {
    const cell = parseCell(
      `| style="background:#FAEB86;" | '''[[Frank Borzage]]'''`,
    );

    expect(cell.attributes).toContain('background:#FAEB86');
    expect(cell.content).toBe(`'''[[Frank Borzage]]'''`);
  });

  it('rowspanを読む', () => {
    const cell = parseCell(
      `! scope="row" rowspan=6 style="text-align:center;" | [[1927 in film|1927]]`,
    );

    expect(cell.rowspan).toBe(6);
    expect(cell.content).toBe('[[1927 in film|1927]]');
  });

  it('属性の無いセルは内容だけ', () => {
    const cell = parseCell(`|{{sort|Brenon|[[Herbert Brenon]]}}`);

    expect(cell.attributes).toBe('');
    expect(cell.content).toBe('{{sort|Brenon|[[Herbert Brenon]]}}');
    expect(cell.rowspan).toBe(1);
  });

  it('先頭が || のセルは空の属性として扱う', () => {
    const cell = parseCell(`||{{sort|Peele|[[Jordan Peele]]}}`);

    expect(cell.content).toBe('{{sort|Peele|[[Jordan Peele]]}}');
  });
});

describe('cellsOf', () => {
  const chunk = `
! scope="row" rowspan=2 | [[1927 in film|1927]]
| [[Frank Borzage]]
| ''[[7th Heaven (1927 film)|7th Heaven]]''
|}`;

  it('指定した記号で始まる行だけをセルにする', () => {
    expect(cellsOf(chunk, ['|']).map(cell => cell.content)).toEqual([
      '[[Frank Borzage]]',
      `''[[7th Heaven (1927 film)|7th Heaven]]''`,
    ]);
  });

  it('見出しセルとデータセルを同じ行として読める', () => {
    expect(cellsOf(chunk, ['!', '|']).map(cell => cell.content)).toEqual([
      '[[1927 in film|1927]]',
      '[[Frank Borzage]]',
      `''[[7th Heaven (1927 film)|7th Heaven]]''`,
    ]);
  });
});

describe('fillRow', () => {
  it('rowspanのセルを次の行に持ち越す', () => {
    const carried: Parameters<typeof fillRow>[1] = [];
    const first = fillRow(
      cellsOf(
        `| rowspan=2 | [[Frank Lloyd]]\n| ''[[Drag (1929 film)|Drag]]''`,
        ['|'],
      ),
      carried,
      2,
    );
    const second = fillRow(cellsOf(`| ''[[Weary River]]''`, ['|']), carried, 2);

    expect(first.map(cell => cell.content)).toEqual([
      '[[Frank Lloyd]]',
      `''[[Drag (1929 film)|Drag]]''`,
    ]);
    expect(second.map(cell => cell.content)).toEqual([
      '[[Frank Lloyd]]',
      `''[[Weary River]]''`,
    ]);
  });
});

describe('parseCell の colspan', () => {
  it('colspanを読む', () => {
    const cell = parseCell(
      `| colspan="2" style="background:#B0C4DE;" | '''[[Billy Wilder]]'''`,
    );

    expect(cell.colspan).toBe(2);
    expect(cell.content).toBe(`'''[[Billy Wilder]]'''`);
  });

  it('引用符の無い colspan も読む', () => {
    const cell = parseCell(
      `| style="background:#B0C4DE;", colspan=2 | ''[[Genevieve (film)|Genevieve]]''`,
    );

    expect(cell.colspan).toBe(2);
    expect(cell.attributes).toContain('background:#B0C4DE');
  });

  it('colspan が無ければ1', () => {
    expect(parseCell(`| [[Riz Ahmed]]`).colspan).toBe(1);
  });
});

describe('cellsOf の1行に並んだセル', () => {
  it('|| で区切られたセルを分ける', () => {
    const cells = cellsOf(
      `| style="background:#B0C4DE;" | '''[[Paul Lukas]]''' || style="background:#B0C4DE;" | '''Kurt Muller''' || ''[[Watch on the Rhine]]''`,
      ['|'],
    );

    expect(cells.map(cell => cell.content)).toEqual([
      `'''[[Paul Lukas]]'''`,
      `'''Kurt Muller'''`,
      `''[[Watch on the Rhine]]''`,
    ]);
    expect(cells[1].attributes).toContain('background:#B0C4DE');
  });

  it('!! で区切られた見出しセルを分ける', () => {
    const cells = cellsOf(`! Year !! Film !! Director`, ['!']);

    expect(cells.map(cell => cell.content)).toEqual([
      'Year',
      'Film',
      'Director',
    ]);
  });

  it('行頭の空白を無視する', () => {
    const cells = cellsOf(
      ` |''[[Coraline (film)|Coraline]]''\n| [[Henry Selick]]`,
      ['|'],
    );

    expect(cells.map(cell => cell.content)).toEqual([
      `''[[Coraline (film)|Coraline]]''`,
      '[[Henry Selick]]',
    ]);
  });

  it('先頭の || は区切りにしない', () => {
    const cells = cellsOf(
      `||{{sort|Peele|[[Jordan Peele]]}} || ''[[Get Out]]''`,
      ['|'],
    );

    expect(cells.map(cell => cell.content)).toEqual([
      '{{sort|Peele|[[Jordan Peele]]}}',
      `''[[Get Out]]''`,
    ]);
  });
});

describe('fillRow の colspan', () => {
  it('colspan の分だけ列を進める', () => {
    const own = cellsOf(
      `| ''[[Some Like It Hot]]'' || colspan="2" | [[Billy Wilder]] || ''[[Porgy and Bess (film)|Porgy and Bess]]''`,
      ['|'],
    );

    const row = fillRow(own, [], 5);

    expect(row[0].content).toBe(`''[[Some Like It Hot]]''`);
    expect(row[1].content).toBe('[[Billy Wilder]]');
    expect(row[2]).toBeUndefined();
    expect(row[3].content).toBe(`''[[Porgy and Bess (film)|Porgy and Bess]]''`);
  });
});
