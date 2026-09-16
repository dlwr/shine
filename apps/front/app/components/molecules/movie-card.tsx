import {useEffect, useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {selectBestPoster} from '@/lib/poster';
import {resolveMovieTitle} from '@/lib/movie-title';
import {MovieCardArticleLinks} from './movie-card/article-links';
import {movieCardLabels} from './movie-card/labels';
import {groupNominationsByOrganization} from './movie-card/nominations-by-organization';
import {MovieCardNominations} from './movie-card/nominations-list';
import {MovieSearchMenu} from './movie-card/search-menu';
import type {MovieCardMovie} from './movie-card/types';

export type {MovieCardMovie} from './movie-card/types';

type MovieCardProperties = {
  movie: MovieCardMovie;
  locale?: string;
  adminToken?: string;
};

function selectJapaneseTitle(movie: MovieCardMovie): string | undefined {
  return movie.translations?.find(
    translation => translation.languageCode === 'ja',
  )?.content;
}

function selectBestTitle(movie: MovieCardMovie, locale: string): string {
  const yearLabel = movie.year ? ` (${movie.year})` : '';
  return resolveMovieTitle(movie, {
    locale,
    preferredLanguages: ['ja', 'en'],
    noTranslationsFallback: `Unknown Title${yearLabel}`,
  });
}

function selectPosterUrl(
  movie: MovieCardMovie,
  locale: string,
): string | undefined {
  return movie.posterUrls && movie.posterUrls.length > 0
    ? selectBestPoster(movie.posterUrls, locale)
    : movie.posterUrl;
}

export function MovieCard({
  movie,
  locale = 'en',
  adminToken,
}: MovieCardProperties) {
  const [showStreamingMenu, setShowStreamingMenu] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const cardReference = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        cardReference.current &&
        !cardReference.current.contains(event.target as Node)
      ) {
        setShowStreamingMenu(false);
      }
    };

    if (showStreamingMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showStreamingMenu]);

  const t = movieCardLabels(locale);
  const movieTitle = selectBestTitle(movie, locale);
  const discasTitle = selectJapaneseTitle(movie) ?? movieTitle;
  const posterUrl = selectPosterUrl(movie, locale);
  const organizationGroups = groupNominationsByOrganization(
    movie.nominations ?? [],
  );
  const isMobile = globalThis.window !== undefined && window.innerWidth <= 768;

  return (
    <Card ref={cardReference} className="relative h-full w-80 overflow-hidden">
      <div
        className="aspect-2/3 bg-gray-100 flex items-center justify-center relative cursor-pointer"
        onMouseEnter={() => !isMobile && setShowStreamingMenu(true)}
        onMouseLeave={() => !isMobile && setShowStreamingMenu(false)}
        onClick={() => isMobile && setShowStreamingMenu(!showStreamingMenu)}>
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={`${movieTitle} poster`}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-gray-500 text-xl">{t.noPoster}</div>
        )}
        {showStreamingMenu && (
          <MovieSearchMenu
            title={movieTitle}
            discasTitle={discasTitle}
            year={movie.year}
            tmdbId={movie.tmdbId}
            imdbUrl={movie.imdbUrl}
            locale={locale}
            heading={t.searchOn}
          />
        )}
      </div>

      <CardHeader>
        <CardTitle className="text-xl md:text-2xl">{movieTitle}</CardTitle>
        <CardDescription className="text-lg">{movie.year}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col">
        <div
          className={`${
            isMobile && !showDetails ? 'max-h-0 overflow-hidden' : 'max-h-none'
          } transition-all duration-300`}>
          <MovieCardNominations
            groups={organizationGroups}
            labels={t}
            adminToken={adminToken}
          />
          <MovieCardArticleLinks
            articleLinks={movie.articleLinks ?? []}
            labels={t}
          />
          <a
            href={`/movies/${movie.uid}`}
            className="inline-block mx-6 my-3 px-2 py-1 text-gray-500 no-underline rounded text-xs font-normal transition-all duration-200 border border-transparent hover:text-gray-700 hover:bg-gray-100 hover:border-gray-200">
            + {t.addArticle}
          </a>
          {adminToken && (
            <a
              href={`/admin/movies/${movie.uid}`}
              className="inline-block mx-6 my-1 px-2 py-1 bg-blue-600 text-white no-underline rounded text-xs font-medium transition-all duration-200 hover:bg-blue-700">
              {t.adminEdit}
            </a>
          )}
        </div>
        {isMobile && (
          <Button
            onClick={() => {
              setShowDetails(!showDetails);
            }}
            variant="outline"
            className="w-full mt-3 text-gray-500"
            size="sm">
            <span>{showDetails ? t.showLess : t.showMore}</span>
            <span
              className={`text-xs transition-transform duration-200 ${
                showDetails ? 'rotate-180' : ''
              }`}>
              ▼
            </span>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
