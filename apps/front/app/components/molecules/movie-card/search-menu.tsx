import type {MouseEvent} from 'react';

type SearchMenuProperties = {
  title: string;
  discasTitle: string;
  year?: number;
  tmdbId?: string | number;
  imdbUrl?: string;
  locale: string;
  heading: string;
};

const BUTTON_CLASS =
  'block px-4 py-2.5 rounded-md text-center text-sm font-medium';

function stopPropagation(event: MouseEvent) {
  event.stopPropagation();
}

export function MovieSearchMenu({
  title,
  discasTitle,
  year,
  tmdbId,
  imdbUrl,
  locale,
  heading,
}: SearchMenuProperties) {
  const encodedTitle = encodeURIComponent(title);
  const services = [
    {
      name: 'U-NEXT',
      color: 'bg-black text-white',
      url: `https://video.unext.jp/freeword?query=${encodedTitle}`,
    },
    {
      name: 'Amazon Prime',
      color: 'bg-blue-600 text-white',
      url: `https://www.amazon.co.jp/s/ref=nb_sb_noss_1?url=search-alias%3Dinstant-video&field-keywords=${encodedTitle}`,
    },
    {
      name: 'TMDb',
      color: 'bg-green-600 text-white',
      url: tmdbId
        ? `https://www.themoviedb.org/movie/${tmdbId}`
        : `https://www.themoviedb.org/search?query=${encodedTitle}`,
    },
    {
      name: 'Filmarks',
      color: 'bg-purple-600 text-white',
      url: `https://filmarks.com/search/movies?q=${encodedTitle}`,
    },
    {
      name: 'JustWatch',
      color: 'bg-yellow-400 text-gray-900',
      url: `https://www.justwatch.com/jp/%E6%A4%9C%E7%B4%A2?q=${encodedTitle}`,
    },
  ];
  const imdbHref =
    imdbUrl ||
    `https://www.imdb.com/find?q=${encodeURIComponent(title + ' ' + String(year))}`;
  const googleHref = `https://www.google.com/search?q=${encodeURIComponent(
    title + ' ' + String(year) + ' ' + (locale === 'ja' ? '映画' : 'movie'),
  )}`;

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20 overflow-y-auto">
      <div className="bg-white rounded-lg p-4 max-w-xs w-full mx-4 my-2">
        <h4 className="text-base font-semibold text-gray-900 mb-3 text-center">
          {heading}
        </h4>
        <div className="grid grid-cols-1 gap-2">
          {services.map(service => (
            <a
              key={service.name}
              href={service.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${BUTTON_CLASS} ${service.color}`}
              onClick={stopPropagation}>
              {service.name}
            </a>
          ))}
        </div>
        <a
          href={imdbHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BUTTON_CLASS} mt-2 bg-yellow-500 text-gray-900`}
          onClick={stopPropagation}>
          IMDb
        </a>
        <a
          href={googleHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BUTTON_CLASS} mt-2 bg-gray-600 text-white`}
          onClick={stopPropagation}>
          Google
        </a>
        <form
          action="https://movie-tsutaya.tsite.jp/netdvd/dvd/searchDvdBd.do"
          method="GET"
          acceptCharset="Shift_JIS"
          target="_blank"
          className="mt-2"
          onClick={stopPropagation}>
          <input type="hidden" name="k" value={discasTitle} />
          <button
            type="submit"
            className="w-full px-4 py-2.5 bg-sky-500 text-white rounded-md text-center text-sm font-medium">
            TSUTAYA DISCAS
          </button>
        </form>
        <form
          action="https://rental.geo-online.co.jp/search2/"
          method="GET"
          acceptCharset="euc-jp"
          target="_blank"
          className="mt-2"
          onClick={stopPropagation}>
          <input type="hidden" name="q" value={discasTitle} />
          <button
            type="submit"
            className="w-full px-4 py-2.5 bg-blue-700 text-white rounded-md text-center text-sm font-medium">
            GEO
          </button>
        </form>
      </div>
    </div>
  );
}
