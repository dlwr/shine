import {useState} from 'react';
import {ExternalIdSearch} from './external-id-search';
import {ImdbIdEditor} from './imdb-id-editor';
import {MediaTypeToggle} from './media-type-toggle';
import {TmdbAutoFetch} from './tmdb-auto-fetch';
import {TmdbIdEditor} from './tmdb-id-editor';
import type {MovieDetails} from './types';
import {useMovieUpdates} from './use-movie-updates';
import {YearEditor} from './year-editor';

type MovieInfoEditorProperties = {
  movieData: MovieDetails;
  apiUrl: string;
  movieId: string;
  onMovieDataUpdate: (movieData: MovieDetails) => void;
};

export default function MovieInfoEditor({
  movieData,
  apiUrl,
  movieId,
  onMovieDataUpdate,
}: MovieInfoEditorProperties) {
  const [imdbError, setImdbError] = useState<string | undefined>();
  const [tmdbError, setTmdbError] = useState<string | undefined>();
  const [tmdbRefreshError, setTmdbRefreshError] = useState<
    string | undefined
  >();

  const {performImdbUpdate, performTmdbUpdate} = useMovieUpdates({
    apiUrl,
    movieId,
    onMovieDataUpdate,
  });

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">映画情報</h3>

      <div className="space-y-6">
        <div>
          <strong className="text-gray-700">映画ID:</strong> {movieData.uid}
        </div>

        <YearEditor
          apiUrl={apiUrl}
          movieId={movieId}
          year={movieData.year}
          onMovieDataUpdate={onMovieDataUpdate}
        />

        <div>
          <strong className="text-gray-700">原語:</strong>{' '}
          {movieData.originalLanguage}
        </div>

        <MediaTypeToggle
          movieData={movieData}
          apiUrl={apiUrl}
          movieId={movieId}
          onMovieDataUpdate={onMovieDataUpdate}
        />

        <ImdbIdEditor
          imdbId={movieData.imdbId}
          imdbError={imdbError}
          onImdbErrorChange={error => setImdbError(error)}
          performImdbUpdate={performImdbUpdate}
        />

        <TmdbIdEditor
          apiUrl={apiUrl}
          movieId={movieId}
          tmdbId={movieData.tmdbId}
          tmdbError={tmdbError}
          onTmdbErrorChange={error => setTmdbError(error)}
          onRefreshErrorChange={error => setTmdbRefreshError(error)}
          performTmdbUpdate={performTmdbUpdate}
          onMovieDataUpdate={onMovieDataUpdate}
        />

        <ExternalIdSearch
          apiUrl={apiUrl}
          movieId={movieId}
          movieData={movieData}
          performImdbUpdate={performImdbUpdate}
          performTmdbUpdate={performTmdbUpdate}
          onImdbErrorChange={error => setImdbError(error)}
          onTmdbErrorChange={error => setTmdbError(error)}
        />

        <TmdbAutoFetch
          apiUrl={apiUrl}
          movieId={movieId}
          imdbId={movieData.imdbId}
          onMovieDataUpdate={onMovieDataUpdate}
        />

        {tmdbRefreshError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600">
            {tmdbRefreshError}
          </div>
        )}
      </div>
    </div>
  );
}
