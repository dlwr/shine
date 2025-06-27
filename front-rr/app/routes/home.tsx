import type { Route } from './+types/home';

export function meta(): Route.MetaDescriptor[] {
  return [
    { title: 'SHINE - 世界最高の映画データベース' },
    {
      name: 'description',
      content:
        '日替わり・週替わり・月替わりで厳選された映画をお楽しみください。アカデミー賞、カンヌ国際映画祭、日本アカデミー賞受賞作品を含む包括的な映画データベース。'
    }
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  try {
    const apiUrl =
      context.cloudflare.env.PUBLIC_API_URL || 'http://localhost:8787';
    const response = await fetch(`${apiUrl}/`);

    if (!response.ok) {
      return { error: 'データの取得に失敗しました' };
    }

    const movieSelections = await response.json();
    return { movieSelections };
  } catch {
    return { error: 'APIへの接続に失敗しました' };
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  if ('error' in loaderData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <h1 className="text-xl font-bold text-red-600 mb-4">
            エラーが発生しました
          </h1>
          <p className="text-gray-700">{loaderData.error}</p>
        </div>
      </div>
    );
  }

  const { movieSelections } = loaderData;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">SHINE</h1>
          <p className="text-xl text-gray-600">世界最高の映画データベース</p>
        </header>

        <div className="grid md:grid-cols-3 gap-8">
          {/* 今日の映画 */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              今日の映画
            </h2>
            {movieSelections.daily && (
              <MovieCard movie={movieSelections.daily} />
            )}
          </section>

          {/* 今週の映画 */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              今週の映画
            </h2>
            {movieSelections.weekly && (
              <MovieCard movie={movieSelections.weekly} />
            )}
          </section>

          {/* 今月の映画 */}
          <section className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              今月の映画
            </h2>
            {movieSelections.monthly && (
              <MovieCard movie={movieSelections.monthly} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

interface MovieData {
  movieUid: string;
  movie: {
    year: number;
    duration: number;
  };
  translations?: {
    languageCode: string;
    content: string;
  }[];
  posterUrls?: {
    url: string;
  }[];
  nominations?: {
    isWinner: boolean;
    ceremony: {
      name: string;
      year: number;
    };
  }[];
}

function MovieCard({ movie }: { movie: MovieData }) {
  const title =
    movie.translations?.find(
      (t: { languageCode: string }) => t.languageCode === 'ja'
    )?.content || 'タイトル不明';
  const posterUrl = movie.posterUrls?.[0]?.url;
  const winningNominations =
    movie.nominations?.filter((n: { isWinner: boolean }) => n.isWinner) || [];

  return (
    <div className="space-y-4">
      <a
        href={`/movies/${movie.movieUid}`}
        className="block hover:opacity-80 transition-opacity"
      >
        {posterUrl && (
          <img
            src={posterUrl}
            alt={title}
            className="w-full h-64 object-cover rounded-lg"
          />
        )}
        <h3 className="text-lg font-medium text-gray-900 mt-2">{title}</h3>
      </a>

      <div className="space-y-1">
        <p className="text-sm text-gray-600">
          {movie.movie.year}年 • {movie.movie.duration}分
        </p>

        {winningNominations.length > 0 && (
          <div className="space-y-1">
            {winningNominations.map(
              (
                nomination: { ceremony: { name: string; year: number } },
                index: number
              ) => (
                <span
                  key={index}
                  className="inline-block bg-yellow-400 text-yellow-900 text-xs px-2 py-1 rounded-full"
                >
                  🏆 {nomination.ceremony.name} {nomination.ceremony.year} 受賞
                </span>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
