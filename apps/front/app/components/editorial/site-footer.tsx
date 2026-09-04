const COPY = {
  ja: {
    heading: 'SHINE について',
    lead: '映画賞の受賞作や名作リストから毎月1本を選び、みんなで同じ映画を観るサイトです。日替わり・週替わりの1本もあります。',
    sources:
      'カンヌ・ヴェネツィア・ベルリンの三大映画祭、アカデミー賞、日本アカデミー賞、キネマ旬報ベスト・テン、雑誌の特集リストなど7,500本以上から抽選し、いま配信やレンタルで観られるかも一緒に表示します。',
    searchLabel: '映画を検索する',
    awardsLabel: '映画賞から探す',
    dataCredit: '映画データは',
    dataCreditTail: 'と Wikipedia を利用しています。',
  },
  en: {
    heading: 'About SHINE',
    lead: 'SHINE picks one film a month from award winners and curated lists, for everyone to watch together. There are daily and weekly picks too.',
    sources:
      'Drawn from over 7,500 films — Cannes, Venice, Berlin, the Academy Awards, the Japan Academy Film Prize, Kinema Junpo best-ten lists, magazine features — with where you can watch each one right now.',
    searchLabel: 'Search films',
    awardsLabel: 'Browse by award',
    dataCredit: 'Film data from',
    dataCreditTail: 'and Wikipedia.',
  },
} as const;

const TMDB_ATTRIBUTION =
  'This product uses the TMDb API but is not endorsed or certified by TMDb.';

export function SiteFooter({locale = 'ja'}: {locale?: string}) {
  const copy = COPY[locale as keyof typeof COPY] ?? COPY.ja;

  return (
    <footer className="mt-12 border-t-2 border-ink pt-6 pb-10">
      <h2 className="font-display font-black text-lg tracking-tight mb-2">
        {copy.heading}
      </h2>
      <p className="text-sm leading-relaxed text-ink mb-1.5">{copy.lead}</p>
      <p className="text-sm leading-relaxed text-ink-muted mb-4">
        {copy.sources}
      </p>

      <div className="flex flex-wrap gap-2">
        <a
          href="/search"
          className="inline-block font-mono text-xs font-bold border-2 border-ink px-3 py-1.5 shadow-[3px_3px_0_var(--ink)] no-underline text-ink">
          {copy.searchLabel}
        </a>
        <a
          href="/awards"
          className="inline-block font-mono text-xs font-bold border-2 border-ink px-3 py-1.5 shadow-[3px_3px_0_var(--ink)] no-underline text-ink">
          {copy.awardsLabel}
        </a>
      </div>

      <p className="mt-6 font-mono text-[10px] leading-relaxed text-ink-muted">
        {copy.dataCredit}{' '}
        <a
          href="https://www.themoviedb.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline">
          TMDb
        </a>{' '}
        {copy.dataCreditTail}
        <br />
        {TMDB_ATTRIBUTION}
      </p>
    </footer>
  );
}
