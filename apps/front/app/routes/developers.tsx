import type {ReactNode} from 'react';
import type {Route} from './+types/developers';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';

const MCP_URL = `${SITE_URL}/mcp`;
const ISSUES_URL = 'https://github.com/dlwr/shine/issues';

const TOOLS = [
  {
    name: 'search_movies',
    text: '邦題・原題で映画を探します。受賞歴の要約と、日本で観られるかが付きます。返すのは最大 10 本で、人名では探せません。',
  },
  {
    name: 'get_movie',
    text: '映画 1 本の詳細です。受賞とノミネート、監督と主な出演者、あらすじ、日本で観られるかと、確かめられた配信・レンタルの先を返します。',
  },
  {
    name: 'list_awards',
    text: 'SHINE が扱う映画賞と映画リストの一覧です。get_award_year に渡す slug が分かります。',
  },
  {
    name: 'get_award_year',
    text: '賞と授賞式の年を指定して、受賞作・ノミネート作と、それぞれが日本で観られるかを返します（最大 50 本）。',
  },
];

const AVAILABILITY = [
  {
    value: 'watchable',
    text: '配信かレンタルで観られることを、TSUTAYA DISCAS 以外の確認先で確かめた。',
  },
  {
    value: 'rental_only',
    text: 'TSUTAYA DISCAS の宅配レンタルだけで見つかった。題名の似た別の作品のこともあるので、確かめが要る。',
  },
  {
    value: 'unwatchable',
    text: '観られないという確認結果があり、観られるという結果はない。',
  },
  {
    value: 'unchecked',
    text: 'まだ確かめていない。観られないという意味ではない。',
  },
];

const DISCOVERY = [
  {label: 'MCP Server Card', url: `${SITE_URL}/mcp/server-card`},
  {
    label: 'Agent Skills',
    url: `${SITE_URL}/.well-known/agent-skills/index.json`,
  },
  {label: 'API Catalog', url: `${SITE_URL}/.well-known/api-catalog`},
  {label: 'AI Catalog', url: `${SITE_URL}/.well-known/ai-catalog.json`},
];

const TMDB_ATTRIBUTION =
  'This product uses the TMDb API but is not endorsed or certified by TMDb.';

export function meta(): Route.MetaDescriptors {
  return buildSocialMeta({
    title: 'AI から SHINE を使う | SHINE',
    description:
      'SHINE の映画と映画賞のデータを、AI のアシスタントやエージェントから MCP で引くための案内。接続先、ツール、データの出どころ、プライバシー。',
    path: '/developers',
    locale: 'ja',
  });
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-t border-rule pt-4 mt-8">
      <h2 className="font-display font-bold text-xl mb-3">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function Url({href}: {href: string}) {
  return (
    <a href={href} className="break-all text-ink underline">
      {href}
    </a>
  );
}

function Terms({items}: {items: Array<{term: string; text: string}>}) {
  return (
    <dl className="space-y-3">
      {items.map(item => (
        <div key={item.term}>
          <dt className="font-bold break-all">{item.term}</dt>
          <dd className="text-ink-muted">{item.text}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Masthead locale="ja" />

        <h1 className="font-display font-bold text-2xl md:text-3xl mb-3">
          AI から SHINE を使う
        </h1>
        <p className="text-sm leading-relaxed">
          SHINE の映画と映画賞のデータは、AI のアシスタントやエージェントから
          MCP（Model Context
          Protocol）で引けます。読み取り専用で、登録も認証も要りません。
        </p>

        <Section id="connect" title="つなぎ方">
          <p>
            接続先は <Url href={MCP_URL} /> です。
          </p>
          <p>
            Claude ならカスタムコネクタにこの URL を入れるだけで使えます。ほかの
            MCP クライアントでも、Streamable HTTP の接続先として同じ URL
            を指定してください。Claude Code では「claude mcp add --transport
            http shine-film {MCP_URL}」で足せます。
          </p>
        </Section>

        <Section id="tools" title="できること">
          <Terms
            items={TOOLS.map(tool => ({term: tool.name, text: tool.text}))}
          />
          <p>
            どのツールも locale に ja（既定）か en を指定できます。応答には
            shine-film.com の該当するページの URL が入ります。
          </p>
          <p>
            たとえば、list_awards で賞の slug を調べ、get_award_year
            でその年の受賞作を出し、気になった 1 本を get_movie
            で詳しく見る、という流れで使えます。
          </p>
        </Section>

        <Section id="availability" title="日本で観られるか">
          <p>応答の japanAvailability は次の 4 つのどれかです。</p>
          <Terms
            items={AVAILABILITY.map(entry => ({
              term: entry.value,
              text: entry.text,
            }))}
          />
          <p>
            SHINE
            が定期的に確かめた時点の結果で、いまこの瞬間の状況ではありません。
          </p>
        </Section>

        <Section id="compatibility" title="互換性">
          <p>
            この MCP
            サーバーはベストエフォートで動かしています。ツールの名前・引数・返す形は予告なく変わります。版の管理や廃止の予告もしません。接続のたびにツールの一覧を読み直す使い方をしてください。
          </p>
          <p>
            1 つの IP アドレスからの呼び出しが多すぎると HTTP 429
            を返します。止めているあいだは HTTP 503
            を返します。サイトが内部で使っている API は公開していません。
          </p>
        </Section>

        <Section id="discovery" title="エージェント向けの公開物">
          <p>
            エージェントやクローラーが見つけられるように、次を置いています。
          </p>
          <Terms
            items={DISCOVERY.map(entry => ({
              term: entry.label,
              text: entry.url,
            }))}
          />
          <p>
            サイトの各ページは、Accept: text/markdown を付けて取ると Markdown
            で返ります。
          </p>
        </Section>

        <Section id="sources" title="データの出どころ">
          <p>
            映画の題名・あらすじ・ポスター・監督と出演者は TMDb
            から取っています。邦題の一部は Wikidata と Wikipedia
            で補っています。
          </p>
          <p>
            映画賞の受賞・ノミネートと映画リストは、主に Wikipedia
            の日本語版・英語版の記事から取り込んでいます。一部は IMDb
            のページによります。
          </p>
          <p>
            日本で観られるかは、TMDb の配信情報（データ提供
            JustWatch）と、U-NEXT・TSUTAYA
            DISCAS・ゲオ宅配レンタルの検索結果で確かめています。
          </p>
          <p>誤りもあります。見つけたら下の連絡先から知らせてください。</p>
          <p className="text-ink-muted">{TMDB_ATTRIBUTION}</p>
        </Section>

        <Section id="privacy" title="プライバシー">
          <p>
            SHINE
            にはアカウントがないので、名前やメールアドレスは受け取りません。記録しているのは次のものです。
          </p>
          <Terms
            items={[
              {
                term: 'アクセスのログ',
                text: 'サイトと MCP へのリクエストは 1 回ごとに Cloudflare Workers のログ（Workers Logs）に残り、7 日で消えます。入るのは URL（サイトの検索ページでは検索語を含む）、IP アドレス、User-Agent、IP アドレスから推定される国・都市などの所在地と接続元のネットワーク、応答の状態と処理時間です。',
              },
              {
                term: 'MCP に渡した引数',
                text: 'MCP のツールの名前と引数（検索語など）はリクエストの本文に入るため、このログには残りません。',
              },
              {
                term: '呼び出しの回数の制限',
                text: '連続したリクエストを制限するために IP アドレスを使います。MCP では IP アドレスと回数を Cloudflare Workers の実行環境のメモリに一時的に持つだけで、どこにも書き出しません。',
              },
              {
                term: '検索結果のキャッシュ',
                text: 'サイトの検索と search_movies の結果は、検索語を鍵にして Cloudflare KV に 24 時間置きます。鍵に入るのは検索語と表示の条件だけで、誰が検索したかとは結び付きません。',
              },
              {
                term: '閲覧の集計',
                text: 'サイトのページの閲覧は Cloudflare Web Analytics で数えています（どのページが、どこから来て、どの国・端末で見られたか）。MCP の呼び出しは対象外です。',
              },
              {
                term: '「観た」と関連リンクの投稿',
                text: '「観た」の印と関連リンクの投稿は、連投を制限し重複を防ぐために、送信元の IP アドレスと一緒にデータベースに保存します。',
              },
            ]}
          />
        </Section>

        <Section id="contact" title="連絡先">
          <p>
            不具合、データの誤り、困る使われ方などは{' '}
            <a href={ISSUES_URL} className="text-ink underline">
              GitHub の issue
            </a>{' '}
            で知らせてください。
          </p>
        </Section>

        <SiteFooter locale="ja" />
      </div>
    </div>
  );
}
