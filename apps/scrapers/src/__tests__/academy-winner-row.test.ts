import * as cheerio from 'cheerio';
import {describe, expect, it} from 'vitest';
import {isWinnerRow} from '../academy-awards';

function rowOf(html: string) {
  const $ = cheerio.load(`<table><tbody>${html}</tbody></table>`);
  return $('tr').first();
}

describe('isWinnerRow', () => {
  it('太字の作品セルを受賞にする', () => {
    expect(
      isWinnerRow(
        rowOf('<tr><td><b>Patton</b></td><td>Frank McCarthy</td></tr>'),
      ),
    ).toBe(true);
  });

  it('受賞行の背景色を受賞にする', () => {
    expect(
      isWinnerRow(
        rowOf(
          '<tr><td style="background:#FAEB86">Patton</td><td>Frank McCarthy</td></tr>',
        ),
      ),
    ).toBe(true);
  });

  it('題名の末尾の星印を受賞にする', () => {
    expect(isWinnerRow(rowOf('<tr><td>Patton *</td><td></td></tr>'))).toBe(
      true,
    );
  });

  it('題名に含まれる星印を受賞にしない', () => {
    expect(isWinnerRow(rowOf('<tr><td>M*A*S*H</td><td></td></tr>'))).toBe(
      false,
    );
  });

  it('印の無いノミネート行を受賞にしない', () => {
    expect(isWinnerRow(rowOf('<tr><td>Airport</td><td></td></tr>'))).toBe(
      false,
    );
  });
});
