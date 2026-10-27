import type {Route} from './+types/shiritori';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {getLocaleFromRequest} from '@/lib/locale';
import {NOINDEX_FOLLOW, buildSocialMeta, SITE_URL} from '@/lib/meta';
import {loadApiJson} from '@/lib/api';
import type {ShiritoriChainData} from '@/lib/api-types';

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const titles = loaderData.chain.links.map(link => `『${link.title}』`);
  return [
    ...buildSocialMeta({
      title: '映画しりとり | SHINE',
      description: `邦題の最後の字から次の映画へ。${titles.join('→')}`,
      path: '/shiritori',
      locale: loaderData.locale,
      imageUrl: `${SITE_URL}/og/home.png`,
      largeImage: true,
    }),
    NOINDEX_FOLLOW,
  ];
}

export async function loader({context, request}: Route.LoaderArgs) {
  const from = new URL(request.url).searchParams.get('from');
  const chain = await loadApiJson<ShiritoriChainData>(
    context,
    from ? `/shiritori?from=${encodeURIComponent(from)}` : '/shiritori',
    {label: 'shiritori', signal: request.signal},
  );
  return {chain, locale: getLocaleFromRequest(request)};
}

export default function ShiritoriPage({loaderData}: Route.ComponentProps) {
  const {chain} = loaderData;
  const locale = 'ja';
  const lastLink = chain.links.at(-1);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale={locale} />

        <h1 className="font-display font-extrabold text-3xl md:text-4xl mb-2">
          {chain.from ? '映画しりとり' : '今日の映画しりとり'}
        </h1>
        <p className="font-label text-xs text-ink-muted mb-8">
          邦題の最後の字から始まる映画へつなぐ。濁点は外し、のばす音は母音で読む。
        </p>

        <ol className="list-none p-0 border-t-[3px] border-ink">
          {chain.links.map((link, index) => (
            <li key={link.uid} className="border-b border-rule py-4">
              <a
                href={`/movies/${link.uid}`}
                className="block min-w-0 font-display font-bold text-lg leading-tight break-words no-underline text-ink">
                『{link.title}』
                {link.year && (
                  <span className="font-label text-xs font-normal text-ink-muted ml-2">
                    {link.year}年
                  </span>
                )}
              </a>
              <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-2 font-label text-xs text-ink-muted">
                <span>「{link.last}」へ</span>
                {link.watchable && <span>日本で観られる</span>}
                {index > 0 && (
                  <a
                    href={`/shiritori?from=${encodeURIComponent(link.uid)}`}
                    aria-label={`『${link.title}』から続ける`}
                    className="text-ink">
                    ここから続ける
                  </a>
                )}
              </p>
            </li>
          ))}
        </ol>

        {lastLink?.last === 'ん' && (
          <p className="font-display font-bold mt-4">「ん」で終わり</p>
        )}

        {chain.from && (
          <p className="mt-8">
            <a
              href="/shiritori"
              className="inline-block border border-ink px-3 py-1.5 font-label text-xs font-bold no-underline text-ink">
              今日のしりとりへ戻る
            </a>
          </p>
        )}

        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}
