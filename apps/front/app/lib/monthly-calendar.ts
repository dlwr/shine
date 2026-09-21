import {SITE_URL} from './meta';
import {TAGLINE} from './tagline';

export type CalendarItem = {
  uid: string;
  title: string;
  year?: number;
  selectionDate: string;
};

const MAX_LINE_OCTETS = 75;
const encoder = new TextEncoder();

function escapeText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', String.raw`\;`)
    .replaceAll(',', String.raw`\,`)
    .replaceAll(/\r?\n/g, String.raw`\n`);
}

// RFC 5545 は 1 行 75 オクテットまで。続きの行は空白 1 つで始め、UTF-8 の途中では切らない
function foldLine(line: string): string[] {
  const folded: string[] = [];
  let current = '';
  let currentOctets = 0;

  for (const character of line) {
    const octets = encoder.encode(character).length;
    if (currentOctets + octets > MAX_LINE_OCTETS) {
      folded.push(current);
      current = ' ';
      currentOctets = 1;
    }

    current += character;
    currentOctets += octets;
  }

  folded.push(current);
  return folded;
}

function toDateValue(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function toUtcStamp(selectionDate: string): string {
  return new Date(`${selectionDate}T00:00:00+09:00`)
    .toISOString()
    .replaceAll(/[-:]|\.\d{3}/g, '');
}

function eventLines(item: CalendarItem): string[] {
  const start = new Date(`${item.selectionDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const yearPart = item.year ? `(${item.year})` : '';
  const url = `${SITE_URL}/movies/${item.uid}#article-links`;

  return [
    'BEGIN:VEVENT',
    `UID:monthly-${item.selectionDate.slice(0, 7)}@shine-film.com`,
    `DTSTAMP:${toUtcStamp(item.selectionDate)}`,
    `DTSTART;VALUE=DATE:${toDateValue(start)}`,
    `DTEND;VALUE=DATE:${toDateValue(end)}`,
    `SUMMARY:${escapeText(`今月の1本『${item.title}』${yearPart}`)}`,
    `DESCRIPTION:${escapeText(`${TAGLINE}。観たら映画ページにひとことや記事・SNS のポストを残してください。\n${url}`)}`,
    `URL:${url}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

export function buildMonthlyCalendar(items: CalendarItem[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SHINE//Monthly Pick//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:SHINE 今月の1本',
    `X-WR-CALDESC:${escapeText(TAGLINE)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
    ...items.flatMap(item => eventLines(item)),
    'END:VCALENDAR',
  ];

  return lines.flatMap(line => foldLine(line)).join('\r\n') + '\r\n';
}
