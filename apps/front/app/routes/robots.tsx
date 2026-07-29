import {SITE_URL} from '@/lib/meta';

// /search は Disallow せず noindex メタタグに任せる。
// robots.txt でブロックするとクローラーがページを取得できず、noindex が読まれない。
const ROBOTS_TXT = `User-agent: *
Allow: /
Disallow: /admin

Sitemap: ${SITE_URL}/sitemap.xml
`;

export function loader() {
  return new Response(ROBOTS_TXT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
