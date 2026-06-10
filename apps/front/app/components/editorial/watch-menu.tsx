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
      color: 'bg-black text-white',
      url: `https://video.unext.jp/freeword?query=${encodeURIComponent(title)}`,
    },
    {
      name: 'Amazon Prime',
      color: 'bg-blue-600 text-white',
      url: `https://www.amazon.co.jp/s?k=${encodeURIComponent(title)}&i=instant-video`,
    },
    {
      name: 'TMDb',
      color: 'bg-green-600 text-white',
      url: tmdbId
        ? `https://www.themoviedb.org/movie/${tmdbId}`
        : `https://www.themoviedb.org/search?query=${encodeURIComponent(title)}`,
    },
    {
      name: 'Filmarks',
      color: 'bg-purple-600 text-white',
      url: `https://filmarks.com/search/movies?q=${encodeURIComponent(title)}`,
    },
    {
      name: 'JustWatch',
      color: 'bg-yellow-400 text-gray-900',
      url: `https://www.justwatch.com/jp/検索?q=${encodeURIComponent(title)}`,
    },
    {
      name: 'IMDb',
      color: 'bg-yellow-500 text-gray-900',
      url:
        imdbUrl ??
        `https://www.imdb.com/find?q=${encodeURIComponent(`${title} ${year ?? ''}`)}`,
    },
    {
      name: 'Google',
      color: 'bg-white text-gray-900',
      url: `https://www.google.com/search?q=${encodeURIComponent(`${title} ${year ?? ''} 映画`)}`,
    },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {services.map(service => (
        <a
          key={service.name}
          href={service.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`border-2 border-ink px-2 py-1 font-mono text-[10px] font-bold shadow-[2px_2px_0_var(--ink)] ${service.color}`}>
          {service.name}
        </a>
      ))}
    </div>
  );
}
