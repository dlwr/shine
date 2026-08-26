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
