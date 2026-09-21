import {describe, expect, it} from 'vitest';
import {buildMonthlyCalendar, type CalendarItem} from './monthly-calendar';

const items: CalendarItem[] = [
  {
    uid: 'movie-9',
    title: 'ぬいぐるみとしゃべる人はやさしい',
    year: 2023,
    selectionDate: '2026-09-01',
  },
  {
    uid: 'movie-8',
    title: String.raw`Tom, Jerry; and \ friends`,
    year: undefined,
    selectionDate: '2026-08-01',
  },
];

function unfold(calendar: string): string[] {
  return calendar.replaceAll('\r\n ', '').split('\r\n');
}

describe('buildMonthlyCalendar', () => {
  it('VCALENDAR で始まり VCALENDAR で終わる', () => {
    const lines = unfold(buildMonthlyCalendar(items));

    expect([lines[0], lines.at(-2)]).toEqual([
      'BEGIN:VCALENDAR',
      'END:VCALENDAR',
    ]);
  });

  it('行末は CRLF で、最後も CRLF で終わる', () => {
    const calendar = buildMonthlyCalendar(items);

    expect(calendar.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    expect(calendar.endsWith('\r\n')).toBe(true);
  });

  it('月ごとに 1 件の予定を出す', () => {
    const lines = unfold(buildMonthlyCalendar(items));

    expect(lines.filter(line => line === 'BEGIN:VEVENT')).toHaveLength(2);
  });

  it('その月の 1 日の終日予定にする', () => {
    const lines = unfold(buildMonthlyCalendar(items));

    expect(lines).toContain('DTSTART;VALUE=DATE:20260901');
    expect(lines).toContain('DTEND;VALUE=DATE:20260902');
  });

  it('月末の 1 日なら翌月 1 日で終わる', () => {
    const lines = unfold(
      buildMonthlyCalendar([{...items[0], selectionDate: '2026-12-31'}]),
    );

    expect(lines).toContain('DTEND;VALUE=DATE:20270101');
  });

  it('題名と製作年を予定の名前にする', () => {
    const lines = unfold(buildMonthlyCalendar(items));

    expect(lines).toContain(
      'SUMMARY:今月の1本『ぬいぐるみとしゃべる人はやさしい』(2023)',
    );
  });

  it('製作年が無ければ題名だけにする', () => {
    const lines = unfold(buildMonthlyCalendar([items[1]]));

    expect(lines).toContain(
      String.raw`SUMMARY:今月の1本『Tom\, Jerry\; and \\ friends』`,
    );
  });

  it('映画ページの関連リンク欄へ飛ばす', () => {
    const lines = unfold(buildMonthlyCalendar(items));

    expect(lines).toContain(
      'URL:https://shine-film.com/movies/movie-9#article-links',
    );
  });

  it('月が同じなら取り直しても同じ UID になる', () => {
    const lines = unfold(buildMonthlyCalendar(items));

    expect(lines).toContain('UID:monthly-2026-09@shine-film.com');
  });

  it('DTSTAMP を選出日の 0 時（JST）の UTC 表記にする', () => {
    const lines = unfold(buildMonthlyCalendar(items));

    expect(lines).toContain('DTSTAMP:20260831T150000Z');
  });

  it('1 行を 75 オクテット以内に折り返す', () => {
    const calendar = buildMonthlyCalendar(items);
    const encoder = new TextEncoder();
    const lengths = calendar
      .split('\r\n')
      .map(line => encoder.encode(line).length);

    expect(Math.max(...lengths)).toBeLessThanOrEqual(75);
  });

  it('折り返しで文字を壊さない', () => {
    const lines = unfold(buildMonthlyCalendar(items));
    const description = lines.find(line => line.startsWith('DESCRIPTION:'));

    expect(description).toContain('毎月1本、みんなで同じ映画を観る');
  });

  it('予定が無くても空のカレンダーを返す', () => {
    const lines = unfold(buildMonthlyCalendar([]));

    expect(lines).not.toContain('BEGIN:VEVENT');
  });
});
