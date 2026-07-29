import {SITE_URL} from './meta';

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';

export type SitemapEntry = {
  path: string;
  changefreq?: 'daily' | 'weekly' | 'monthly' | 'yearly';
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function toAbsoluteUrl(path: string): string {
  return escapeXml(new URL(path, SITE_URL).toString());
}

export function buildSitemapIndex(paths: string[]): string {
  const entries = paths
    .map(
      path =>
        `  <sitemap>\n    <loc>${toAbsoluteUrl(path)}</loc>\n  </sitemap>`,
    )
    .join('\n');

  return `${XML_DECLARATION}\n<sitemapindex xmlns="${SITEMAP_NAMESPACE}">\n${entries}\n</sitemapindex>\n`;
}

export function buildUrlSet(entries: SitemapEntry[]): string {
  const urls = entries
    .map(entry => {
      const changefreq = entry.changefreq
        ? `\n    <changefreq>${entry.changefreq}</changefreq>`
        : '';

      return `  <url>\n    <loc>${toAbsoluteUrl(entry.path)}</loc>${changefreq}\n  </url>`;
    })
    .join('\n');

  return `${XML_DECLARATION}\n<urlset xmlns="${SITEMAP_NAMESPACE}">\n${urls}\n</urlset>\n`;
}
