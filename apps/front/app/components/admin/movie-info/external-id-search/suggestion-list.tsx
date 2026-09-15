import type {ExternalIdSuggestion} from '../types';

type SuggestionListProperties = {
  results: ExternalIdSuggestion[];
  usedQuery: string;
  usedYear: number | undefined;
  showYearDifference: boolean;
  onApplyImdb: (suggestion: ExternalIdSuggestion) => void;
  onApplyTmdb: (suggestion: ExternalIdSuggestion) => void;
  onApplyBoth: (suggestion: ExternalIdSuggestion) => void;
};

export function SuggestionList({
  results,
  usedQuery,
  usedYear,
  showYearDifference,
  onApplyImdb,
  onApplyTmdb,
  onApplyBoth,
}: SuggestionListProperties) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">
        検索キーワード:{' '}
        <span className="font-medium text-gray-700">{usedQuery}</span>
        {usedYear !== undefined && !Number.isNaN(usedYear) && (
          <span className="ml-2">
            公開年:{' '}
            <span className="font-medium text-gray-700">{usedYear}</span>
          </span>
        )}
      </div>
      <ul className="space-y-3">
        {results.map(result => (
          <li
            key={result.tmdbId}
            className="border border-gray-200 rounded-lg bg-gray-50 p-3">
            <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-start">
              <div className="space-y-1">
                <p className="font-semibold text-gray-900">
                  {result.title}{' '}
                  {result.releaseDate && (
                    <span className="text-sm text-gray-600">
                      ({result.releaseDate})
                    </span>
                  )}
                </p>
                {result.originalTitle &&
                  result.originalTitle !== result.title && (
                    <p className="text-sm text-gray-600">
                      原題: {result.originalTitle}
                    </p>
                  )}
                <div className="text-xs text-gray-500 space-x-2">
                  <span>TMDb: {result.tmdbId}</span>
                  {result.imdbId && <span>IMDb: {result.imdbId}</span>}
                </div>
                {typeof result.yearDifference === 'number' &&
                  showYearDifference && (
                    <p className="text-xs text-gray-500">
                      公開年差: {result.yearDifference}年
                    </p>
                  )}
                {result.overview && (
                  <p className="text-xs text-gray-600">
                    {result.overview.length > 180
                      ? `${result.overview.slice(0, 180)}...`
                      : result.overview}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 md:items-end">
                <div className="flex flex-wrap gap-2">
                  {result.imdbId && (
                    <button
                      type="button"
                      onClick={() => {
                        onApplyImdb(result);
                      }}
                      className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700">
                      IMDb IDを設定
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onApplyTmdb(result);
                    }}
                    className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700">
                    TMDb IDを設定
                  </button>
                </div>
                {result.imdbId && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyBoth(result);
                    }}
                    className="bg-indigo-600 text-white px-2 py-1 rounded text-xs hover:bg-indigo-700">
                    両方を設定
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
