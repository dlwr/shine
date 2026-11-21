type WatchMenuProperties = {
  title: string;
  year?: number;
  locale?: string;
  tmdbId?: string | number;
  imdbUrl?: string;
};

export function WatchMenu({title, year, tmdbId, imdbUrl}: WatchMenuProperties) {
  const services = [
    {
      name: 'U-NEXT',
      url: `https://video.unext.jp/freeword?query=${encodeURIComponent(title)}`,
    },
    {
      name: 'Amazon Prime',
      url: `https://www.amazon.co.jp/s?k=${encodeURIComponent(title)}&i=instant-video`,
    },
    {
      name: 'TMDb',
      url: tmdbId
        ? `https://www.themoviedb.org/movie/${tmdbId}`
        : `https://www.themoviedb.org/search?query=${encodeURIComponent(title)}`,
    },
    {
      name: 'Filmarks',
      url: `https://filmarks.com/search/movies?q=${encodeURIComponent(title)}`,
    },
    {
      name: 'JustWatch',
      url: `https://www.justwatch.com/jp/検索?q=${encodeURIComponent(title)}`,
    },
    {
      name: 'IMDb',
      url:
        imdbUrl ??
        `https://www.imdb.com/find?q=${encodeURIComponent(`${title} ${year ?? ''}`)}`,
    },
    {
      name: 'Google',
      url: `https://www.google.com/search?q=${encodeURIComponent(`${title} ${year ?? ''} 映画`)}`,
    },
  ];

  const buttonClass =
    'border border-ink/60 px-2 py-1 font-label text-[11px] text-ink hover:bg-ink hover:text-surface transition-colors';

  return (
    <div className="flex flex-wrap gap-1.5">
      {services.map(service => (
        <a
          key={service.name}
          href={service.url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass}>
          {service.name}
        </a>
      ))}
      <form
        action="https://rental.geo-online.co.jp/search2/"
        method="GET"
        acceptCharset="euc-jp"
        target="_blank"
        className="contents">
        <input type="hidden" name="q" value={title} />
        <button type="submit" className={buttonClass}>
          GEO
        </button>
      </form>
      <form
        action="https://movie-tsutaya.tsite.jp/netdvd/dvd/searchDvdBd.do"
        method="GET"
        acceptCharset="Shift_JIS"
        target="_blank"
        className="contents">
        <input type="hidden" name="k" value={title} />
        <button type="submit" className={buttonClass}>
          TSUTAYA DISCAS
        </button>
      </form>
    </div>
  );
}
