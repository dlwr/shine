import * as cheerio from 'cheerio';
import {describe, expect, it} from 'vitest';
import {extractMoviesFromTableWithYear} from '../japan-academy-awards';

const tableHtml = `
<table>
  <tr><th>作品名</th><th>製作会社</th><th>監督</th><th>脚本</th></tr>
  <tr>
    <td><b>『花いちもんめ』</b></td>
    <td>東映</td>
    <td>伊藤俊也</td>
    <td>早坂暁</td>
  </tr>
  <tr>
    <td>『恋文』</td>
    <td>東映</td>
    <td>神代辰巳</td>
    <td>神代辰巳</td>
  </tr>
</table>
`;

function extract() {
  const $ = cheerio.load(tableHtml);
  return extractMoviesFromTableWithYear($, $('table').first(), 1986);
}

describe('extractMoviesFromTableWithYear', () => {
  it('表の作品をすべて拾う', () => {
    expect(extract().map(movie => movie.title)).toEqual([
      '花いちもんめ',
      '恋文',
    ]);
  });

  it('太字の作品を受賞として扱う', () => {
    expect(extract().map(movie => movie.isWinner)).toEqual([true, false]);
  });

  it('受賞作も優秀作品賞のノミネートとして扱う', () => {
    expect(extract().map(movie => movie.categoryType)).toEqual([
      'Excellent Picture',
      'Excellent Picture',
    ]);
  });
});
