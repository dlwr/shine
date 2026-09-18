import {SITE_URL} from './meta';
import {TAGLINE} from './tagline';

export type FeedPeriod = 'daily' | 'monthly';

export type FeedItem = {
  period: FeedPeriod;
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

function itemTitle(item: FeedItem): string {
  const yearPart = item.year ? `(${item.year})` : '';
  return `『${item.title}』${yearPart}`;
}

function itemLink(item: FeedItem): string {
  const moviePath = `${SITE_URL}/movies/${item.uid}`;
  return item.period === 'monthly' ? `${moviePath}#article-links` : moviePath;
}

function itemDescription(item: FeedItem): string {
  return item.period === 'monthly'
    ? `${itemTitle(item)}。${TAGLINE}。観たら映画ページから記事や SNS のポストを貼ってください。`
    : `${itemTitle(item)}。いま配信・レンタルで観られるかをまとめています。`;
}

export function mergeFeedItems(
  daily: FeedItem[],
  monthly: FeedItem[],
): FeedItem[] {
  return [...monthly, ...daily].toSorted((a, b) => {
    if (a.selectionDate !== b.selectionDate) {
      return a.selectionDate < b.selectionDate ? 1 : -1;
    }

    if (a.period === b.period) {
      return 0;
    }

    return a.period === 'monthly' ? -1 : 1;
  });
}

export function buildRssFeed(items: FeedItem[]): string {
  const itemElements = items
    .map(item => {
      const title =
        item.period === 'monthly'
          ? `今月の1本${itemTitle(item)}`
          : itemTitle(item);
      return [
        '    <item>',
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${itemLink(item)}</link>`,
        `      <guid isPermaLink="false">${item.period}-${item.selectionDate}-${item.uid}</guid>`,
        `      <pubDate>${toPubDate(item.selectionDate)}</pubDate>`,
        `      <description>${escapeXml(itemDescription(item))}</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    '    <title>SHINE — 今月の1本と今日の1本</title>',
    `    <link>${SITE_URL}</link>`,
    `    <description>${TAGLINE}。映画賞や名作リストに選ばれた映画から、今月の1本と毎日の1本を紹介します。</description>`,
    '    <language>ja</language>',
    itemElements,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
