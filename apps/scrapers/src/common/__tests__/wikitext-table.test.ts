import {describe, expect, it} from 'vitest';
import {cellsOf} from '../wikitext-table';

const contentsOf = (line: string) =>
  cellsOf(line, ['|']).map(cell => cell.content);

describe('cellsOf', () => {
  it('1行に || で並んだセルを分ける', () => {
    expect(contentsOf('| [[A]] || [[B]]')).toEqual(['[[A]]', '[[B]]']);
  });

  it('テンプレートの中の || は区切りにしない', () => {
    expect(contentsOf('| {{sortname|Wong|Kar-wai||Wong, Kar-wai}}')).toEqual([
      '{{sortname|Wong|Kar-wai||Wong, Kar-wai}}',
    ]);
  });

  it('テンプレートを含むセルが || で並んでいても分ける', () => {
    expect(
      contentsOf(
        '| {{sortname|Benicio|del Toro}} || {{sortname|Ernesto "Che"|Guevara|Che Guevara}}',
      ),
    ).toEqual([
      '{{sortname|Benicio|del Toro}}',
      '{{sortname|Ernesto "Che"|Guevara|Che Guevara}}',
    ]);
  });

  it('先頭の || は空の属性なので区切りにしない', () => {
    expect(contentsOf('|| [[A]]')).toEqual(['[[A]]']);
  });
});
