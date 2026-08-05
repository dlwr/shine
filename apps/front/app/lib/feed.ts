import {SITE_URL} from './meta';

export type FeedItem = {
  uid: string;
  title: string;
  year?: number;
  selectionDate: string;
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function toPubDate(selectionDate: string): string {
  return new Date(`${selectionDate}T00:00:00+09:00`).toUTCString();
}

export function buildRssFeed(items: FeedItem[]): string {
  const itemElements = items
    .map(item => {
      const yearPart = item.year ? `(${item.year})` : '';
      return [
        '    <item>',
        `      <title>${escapeXml(`『${item.title}』${yearPart}`)}</title>`,
        `      <link>${SITE_URL}/movies/${item.uid}</link>`,
        `      <guid isPermaLink="false">daily-${item.selectionDate}-${item.uid}</guid>`,
        `      <pubDate>${toPubDate(item.selectionDate)}</pubDate>`,
        `      <description>${escapeXml(
          `『${item.title}』${yearPart}。いま配信・レンタルで観られるかをまとめています。`,
        )}</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    '    <title>SHINE — 今日の1本</title>',
    `    <link>${SITE_URL}</link>`,
    '    <description>映画賞や名作リストに選ばれた映画から毎日1本を紹介します。</description>',
    '    <language>ja</language>',
    itemElements,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
