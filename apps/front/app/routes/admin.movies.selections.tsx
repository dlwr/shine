import {useEffect, useState} from 'react';
import {MovieCard} from '@/components/molecules/movie-card';
import {Button} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import type {Route} from './+types/admin.movies.selections';

type SelectionData = {
  date: string;
  movie:
    | {
        uid: string;
        title: string;
        year: number;
        posterUrl?: string;
        nominations?: Array<{
          uid: string;
          isWinner: boolean;
          category: {name: string};
          ceremony: {uid: string; year: number; number?: number};
          organization: {uid: string; name: string; shortName?: string};
        }>;
      }
    | undefined;
};

type PreviewSelections = {
  nextDaily: SelectionData;
  nextWeekly: SelectionData;
  nextMonthly: SelectionData;
};

type SearchMovie = {
  uid: string;
  year: number | undefined;
  title?: string;
  translations?: Array<{
    languageCode: string;
    content: string;
    isDefault: number;
  }>;
  nominations: Array<{
    uid: string;
    isWinner: boolean;
    category: {name: string};
    ceremony: {uid: string; year: number; number?: number};
    organization: {uid: string; name: string; shortName?: string};
  }>;
};

type SearchMovieTranslation = NonNullable<SearchMovie['translations']>[number];

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'daily': {
      return '今日の映画';
    }
    case 'weekly': {
      return '今週の映画';
    }
    case 'monthly': {
      return '今月の映画';
    }
    default: {
      return type;
    }
  }
};

const getTypeColor = (type: string) => {
  switch (type) {
    case 'daily': {
      return 'from-blue-500 to-blue-600';
    }
    case 'weekly': {
      return 'from-green-500 to-green-600';
    }
    case 'monthly': {
      return 'from-purple-500 to-purple-600';
    }
    default: {
      return 'from-gray-500 to-gray-600';
    }
  }
};

export function meta(): Route.MetaDescriptors {
  return [
    {title: '映画選択管理 - SHINE Admin'},
    {name: 'description', content: 'SHINE Admin 映画選択管理画面'},
  ];
}

export async function loader({context}: Route.LoaderArgs) {
  return {
    apiUrl:
      (context.cloudflare as {env: {PUBLIC_API_URL?: string}}).env
        .PUBLIC_API_URL || 'http://localhost:8787',
  };
}

const handleLogout = () => {
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    globalThis.localStorage.removeItem('adminToken');
    globalThis.location.href = '/admin/login';
  }
};

export default function AdminMovieSelections({
  loaderData,
}: Route.ComponentProps) {
  const {apiUrl} = loaderData as {apiUrl: string};
  const locale = 'ja';

  const [selections, setSelections] = useState<PreviewSelections | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [adminToken, setAdminToken] = useState<string | undefined>();

  // Override modal states
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideType, setOverrideType] = useState<
    'daily' | 'weekly' | 'monthly'
  >('daily');
  const [activeTab, setActiveTab] = useState<'search' | 'random'>('search');

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMovie[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Random movie states
  const [randomMovie, setRandomMovie] = useState<SearchMovie | undefined>();
  const [randomLoading, setRandomLoading] = useState(false);

  // Selected movie for override
  const [selectedMovie, setSelectedMovie] = useState<SearchMovie | undefined>();

  // Load movie selections
  useEffect(() => {
    const loadSelections = async () => {
      if (globalThis.window === undefined) {
        return;
      }

      const token = globalThis.localStorage.getItem('adminToken');
      if (!token) {
        globalThis.location.href = '/admin/login';
        return;
      }

      setAdminToken(token);
      setLoading(true);
      setError(undefined);

      try {
        const response = await fetch(
          `${apiUrl}/admin/preview-selections?locale=${locale}`,
          {
            headers: {Authorization: `Bearer ${token}`},
          },
        );

        if (response.status === 401) {
          globalThis.localStorage.removeItem('adminToken');
          globalThis.location.href = '/admin/login';
          return;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch selections');
        }

        const data = (await response.json()) as PreviewSelections;
        setSelections(data);
      } catch (error) {
        console.error('Error loading selections:', error);
        setError('Failed to load movie selections');
      } finally {
        setLoading(false);
      }
    };

    void loadSelections();
  }, [apiUrl, locale]);

  // Search movies with debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const token = globalThis.localStorage.getItem('adminToken');
        const response = await fetch(
          `${apiUrl}/admin/movies?search=${encodeURIComponent(searchQuery)}&limit=20`,
          {headers: {Authorization: `Bearer ${token}`}},
        );

        if (response.ok) {
          const data = (await response.json()) as {movies: SearchMovie[]};
          setSearchResults(data.movies || []);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [searchQuery, apiUrl]);

  const generateRandomMovie = async () => {
    setRandomLoading(true);
    try {
      const token = globalThis.localStorage.getItem('adminToken');
      const response = await fetch(`${apiUrl}/admin/random-movie-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: overrideType,
          date:
            selections?.[
              `next${
                overrideType.charAt(0).toUpperCase() + overrideType.slice(1)
              }` as keyof PreviewSelections
            ]?.date || new Date().toISOString().split('T')[0],
          locale,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as SearchMovie;
        setRandomMovie(data);
      }
    } catch (error) {
      console.error('Random movie error:', error);
    } finally {
      setRandomLoading(false);
    }
  };

  const handleOverride = async () => {
    if (!selectedMovie) {
      return;
    }

    try {
      const token = globalThis.localStorage.getItem('adminToken');
      const response = await fetch(`${apiUrl}/admin/override-selection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: overrideType,
          date:
            selections?.[
              `next${
                overrideType.charAt(0).toUpperCase() + overrideType.slice(1)
              }` as keyof PreviewSelections
            ]?.date || new Date().toISOString().split('T')[0],
          movieId: selectedMovie.uid,
        }),
      });

      if (response.ok) {
        // Reload selections
        globalThis.location.reload();
      }
    } catch (error) {
      console.error('Override error:', error);
    }
  };

  const openOverrideModal = (type: 'daily' | 'weekly' | 'monthly') => {
    setOverrideType(type);
    setShowOverrideModal(true);
    setActiveTab('search');
    setSearchQuery('');
    setSearchResults([]);
    setRandomMovie(undefined);
    setSelectedMovie(undefined);
  };

  const getPrimaryTitle = (movie: SelectionData['movie'] | SearchMovie) => {
    if (!movie) {
      return '無題';
    }

    if ('title' in movie && movie.title) {
      return movie.title;
    }

    if ('translations' in movie && movie.translations) {
      return (
        movie.translations.find(
          (translation: SearchMovieTranslation) => translation.isDefault === 1,
        )?.content ||
        movie.translations.find(
          (translation: SearchMovieTranslation) =>
            translation.languageCode === 'ja',
        )?.content ||
        movie.translations[0]?.content ||
        '無題'
      );
    }

    return '無題';
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <span className="text-sm text-slate-500">読み込み中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>エラーが発生しました</CardTitle>
            <CardDescription className="text-red-600">{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">映画選択管理</h1>
            <p className="text-sm text-gray-600">
              プレビュー用の「今日/今週/今月の映画」を素早く調整できます。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-500">
              <a href="/">トップページ</a>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <a href="/admin/movies">← 映画一覧に戻る</a>
            </Button>
            <Button size="sm" variant="destructive" onClick={handleLogout}>
              ログアウト
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {(['daily', 'weekly', 'monthly'] as const).map(type => {
            const selection =
              selections?.[
                `next${
                  type.charAt(0).toUpperCase() + type.slice(1)
                }` as keyof PreviewSelections
              ];
            return (
              <Card
                key={type}
                data-testid={`${type}-selection`}
                className="overflow-hidden shadow-lg">
                <CardHeader
                  className={`bg-gradient-to-r ${getTypeColor(
                    type,
                  )} text-white`}>
                  <CardTitle className="text-white">
                    {getTypeLabel(type)}
                  </CardTitle>
                  {selection && (
                    <CardDescription className="text-white/90">
                      選択日時:{' '}
                      {new Date(selection.date).toLocaleDateString('ja-JP')}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-6">
                  {selection?.movie ? (
                    <div className="space-y-6">
                      <div className="flex justify-center">
                        <MovieCard
                          movie={selection.movie}
                          locale={locale}
                          adminToken={adminToken}
                        />
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:flex-row">
                        <Button
                          onClick={() => openOverrideModal(type)}
                          className="flex-1 bg-blue-600 text-white hover:bg-blue-500">
                          Override Selection
                        </Button>
                        <Button
                          asChild
                          variant="secondary"
                          className="flex-1 bg-slate-700 text-white hover:bg-slate-600">
                          <a href={`/admin/movies/${selection.movie.uid}`}>
                            Edit Movie
                          </a>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 text-center text-gray-500">
                      <p>選択された映画がありません</p>
                      <Button
                        onClick={() => openOverrideModal(type)}
                        className="bg-blue-600 text-white hover:bg-blue-500">
                        映画を選択
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {showOverrideModal && (
          <div
            data-testid="override-modal"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
            <div className="max-h-screen w-full max-w-4xl overflow-auto rounded-lg bg-white shadow-xl">
              <div className="border-b p-6">
                <h3 className="text-xl font-bold">映画選択をオーバーライド</h3>
                <p className="text-gray-600">
                  {getTypeLabel(overrideType)}の選択
                </p>
              </div>

              <div className="border-b flex">
                <Button
                  data-testid="search-tab"
                  variant="ghost"
                  className={`w-1/2 rounded-none border-b-2 text-sm font-medium ${
                    activeTab === 'search'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                  onClick={() => setActiveTab('search')}>
                  映画を検索
                </Button>
                <Button
                  data-testid="random-tab"
                  variant="ghost"
                  className={`w-1/2 rounded-none border-b-2 text-sm font-medium ${
                    activeTab === 'random'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                  onClick={() => setActiveTab('random')}>
                  ランダム選択
                </Button>
              </div>

              <div className="p-6">
                {activeTab === 'search' && (
                  <div>
                    <Input
                      data-testid="movie-search-input"
                      type="text"
                      placeholder="映画タイトルを検索..."
                      value={searchQuery}
                      onChange={event => setSearchQuery(event.target.value)}
                      className="mb-4"
                    />
                    {searchLoading && (
                      <div className="text-center text-gray-600">検索中...</div>
                    )}
                    <div
                      data-testid="search-results"
                      className="max-h-96 space-y-2 overflow-y-auto">
                      {searchResults.map(movie => (
                        <button
                          type="button"
                          key={movie.uid}
                          onClick={() => setSelectedMovie(movie)}
                          className={`w-full rounded-lg border p-4 text-left transition-colors ${
                            selectedMovie?.uid === movie.uid
                              ? 'border-blue-600 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}>
                          <h4 className="font-medium">
                            {getPrimaryTitle(movie)}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {movie.year && `${movie.year}年`}
                            {movie.nominations?.length > 0 &&
                              ` • ${movie.nominations.length}件のノミネート`}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'random' && (
                  <div className="space-y-6 text-center">
                    <Button
                      onClick={generateRandomMovie}
                      disabled={randomLoading}
                      className="bg-green-600 text-white hover:bg-green-500 disabled:opacity-50">
                      {randomLoading
                        ? 'ランダム映画を生成中...'
                        : 'ランダム映画を生成'}
                    </Button>
                    {randomMovie && (
                      <div
                        data-testid="random-movie-result"
                        className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => setSelectedMovie(randomMovie)}
                          className={`relative inline-flex rounded-xl transition-all duration-200 ${
                            selectedMovie?.uid === randomMovie.uid
                              ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white'
                              : 'hover:ring-2 hover:ring-blue-300 hover:ring-offset-2 hover:ring-offset-white'
                          }`}>
                          <MovieCard
                            movie={randomMovie}
                            locale={locale}
                            adminToken={adminToken}
                          />
                          {selectedMovie?.uid === randomMovie.uid && (
                            <span className="absolute top-3 right-3 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                              選択中
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t p-6">
                <Button
                  variant="outline"
                  onClick={() => setShowOverrideModal(false)}>
                  キャンセル
                </Button>
                <Button
                  onClick={handleOverride}
                  disabled={!selectedMovie}
                  className="bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50">
                  選択を確定
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
