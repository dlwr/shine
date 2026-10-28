import {lazy, Suspense, useEffect, useState} from 'react';
import type {Dispatch, SetStateAction} from 'react';
import type {Route} from './+types/home';
import {Masthead} from '@/components/editorial/masthead';
import {SiteFooter} from '@/components/editorial/site-footer';
import {useAdminToken} from '@/hooks/use-admin-token';
import {DEFAULT_LOCALE, getLocaleFromRequest, type Locale} from '@/lib/locale';
import {SITE_URL, buildSocialMeta} from '@/lib/meta';
import {FilmCard} from '@/components/editorial/film-card';
import {MonthlyPick} from '@/components/editorial/monthly-pick';
import {
  apiFetch,
  canTransformImages,
  resolveApiUrl,
  type LoadContext,
} from '@/lib/api';
import {
  buildSelectionPath,
  fetchHighlightedMovies,
  isNextMonthlyAnnounced,
  selectionRequestHeaders,
  type HighlightedMovies,
  type PeriodType,
} from '@/lib/home';
import {
  loadNextSelection,
  type SelectionHistoryItem,
} from '@/lib/selection-archive';

const AdminSessionBar = lazy(async () => {
  const module_ = await import('@/components/admin/admin-session-bar');
  return {default: module_.AdminSessionBar};
});

const SelectionAdminControls = lazy(async () => {
  const module_ = await import('@/components/admin/selection-admin-controls');
  return {default: module_.SelectionAdminControls};
});

const SECONDARY_PERIODS: PeriodType[] = ['daily', 'weekly'];

const HOME_COPY = {
  ja: {
    title: 'SHINE — 毎月1本、みんなで同じ映画を観る',
    description:
      'カンヌ・アカデミー賞・日本アカデミー賞などの受賞作や名作リストから、毎日・毎週・毎月1本ずつ映画を選びます。いま配信やレンタルで観られるかも一緒に。',
  },
  en: {
    title: 'SHINE — A forgotten film, every day',
    description:
      'One overlooked film a day, a week, and a month — drawn from Cannes, the Academy Awards and curated lists, with where to watch it right now.',
  },
} as const;

export function meta({loaderData}: Route.MetaArgs): Route.MetaDescriptors {
  const locale = loaderData?.locale ?? DEFAULT_LOCALE;
  const copy = HOME_COPY[locale];

  return buildSocialMeta({
    title: copy.title,
    description: copy.description,
    path: '/',
    locale,
    imageUrl: `${SITE_URL}/og/home.png`,
    largeImage: true,
  });
}

async function loadAnnouncedNextMonthly(
  locale: Locale,
  context: LoadContext,
  request: Request,
): Promise<SelectionHistoryItem | undefined> {
  if (!isNextMonthlyAnnounced(new Date())) {
    return undefined;
  }

  try {
    return await loadNextSelection(locale, context, request);
  } catch {
    return undefined;
  }
}

export async function loader({context, request}: Route.LoaderArgs) {
  const locale = getLocaleFromRequest(request);
  const nextMonthlyRequest = loadAnnouncedNextMonthly(locale, context, request);
  let movies: HighlightedMovies | undefined;
  let error: string | undefined;

  try {
    const response = await apiFetch(context, buildSelectionPath(locale), {
      headers: selectionRequestHeaders(locale),
      signal: request.signal,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    movies = (await response.json()) as HighlightedMovies;
  } catch (error_) {
    console.error('SSR fetch error:', error_);
    error = error_ instanceof Error ? error_.message : 'Unknown error occurred';
  }

  return {
    movies,
    nextMonthly: await nextMonthlyRequest,
    error,
    locale,
    apiUrl: resolveApiUrl(context),
    transformImages: canTransformImages(context),
    shouldFetchOnClient: movies === undefined,
  };
}

export default function Home({loaderData}: Route.ComponentProps) {
  const {
    movies: initialMovies,
    nextMonthly,
    error: initialError,
    locale,
    apiUrl,
    transformImages,
    shouldFetchOnClient,
  } = loaderData;

  const [movies, setMovies] = useState<HighlightedMovies | undefined>(
    initialMovies,
  );
  const [error, setError] = useState<string | undefined>(initialError);
  const [loading, setLoading] = useState(shouldFetchOnClient);
  const adminToken = useAdminToken();

  // クライアントサイドでデータフェッチ
  useEffect(() => {
    if (!shouldFetchOnClient || globalThis.window === undefined) {
      return;
    }

    const fetchMovies = async () => {
      try {
        setLoading(true);
        setMovies(await fetchHighlightedMovies(apiUrl, locale));
        setError(undefined);
      } catch (error_) {
        console.error('Error fetching movies:', error_);
        setError(
          error_ instanceof Error ? error_.message : 'Unknown error occurred',
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchMovies();
  }, [shouldFetchOnClient, apiUrl, locale]);

  return (
    <div className="m-0 w-full h-full">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {adminToken && (
          <Suspense>
            <AdminSessionBar locale={locale} />
          </Suspense>
        )}
        <Masthead locale={locale} showTagline={false} />
        <Movies
          movies={movies}
          nextMonthly={nextMonthly}
          error={error}
          locale={locale}
          apiUrl={apiUrl}
          transformImages={transformImages}
          adminToken={adminToken}
          loading={loading}
          onMoviesChange={setMovies}
          onError={setError}
        />
        <SiteFooter locale={locale} />
      </div>
    </div>
  );
}

function Movies({
  movies,
  nextMonthly,
  error,
  locale,
  apiUrl,
  transformImages,
  adminToken,
  loading: isDataLoading,
  onMoviesChange,
  onError,
}: {
  movies: HighlightedMovies | undefined;
  nextMonthly?: SelectionHistoryItem;
  error: string | undefined;
  locale: string;
  apiUrl: string;
  transformImages?: boolean;
  adminToken: string | undefined;
  loading?: boolean;
  onMoviesChange: Dispatch<SetStateAction<HighlightedMovies | undefined>>;
  onError: Dispatch<SetStateAction<string | undefined>>;
}) {
  const noMovieLabel =
    locale === 'ja'
      ? '現在表示できる映画がありません。'
      : 'No movie selected yet.';

  const periodLabels: Record<PeriodType, string> =
    locale === 'ja'
      ? {daily: '今日', weekly: '今週', monthly: '今月'}
      : {daily: 'Today', weekly: 'This week', monthly: 'This month'};
  const alsoShowing = locale === 'ja' ? '併映' : 'Also showing';

  const renderAdminControls = (period: PeriodType) => {
    if (!adminToken) {
      return;
    }

    return (
      <Suspense>
        <SelectionAdminControls
          period={period}
          movieUid={movies?.[period]?.uid}
          locale={locale}
          apiUrl={apiUrl}
          adminToken={adminToken}
          onMoviesChange={onMoviesChange}
          onError={onError}
        />
      </Suspense>
    );
  };

  return (
    <section className="py-4">
      {isDataLoading && (
        <div className="text-center mb-8">
          <div className="inline-flex items-center px-4 py-2 text-ink/60">
            <div className="animate-spin h-5 w-5 border border-ink/40 border-t-transparent rounded-full mr-3"></div>
            {locale === 'ja' ? 'データを読み込み中...' : 'Loading data...'}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 border border-red-600 text-red-600 font-label text-sm">
          {locale === 'ja'
            ? `APIから映画データを取得できませんでした。エラー: ${error}`
            : `Failed to fetch movie data from API. Error: ${error}`}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {movies?.monthly ? (
          <MonthlyPick
            movie={movies.monthly}
            locale={locale}
            transformImages={transformImages}
            apiUrl={apiUrl}
          />
        ) : (
          <p className="text-sm text-ink/50 font-label">{noMovieLabel}</p>
        )}
        {nextMonthly && <NextMonthlyPick movie={nextMonthly} locale={locale} />}
        {renderAdminControls('monthly')}
      </div>

      <h2 className="mt-8 border-b border-rule pb-2 font-display text-lg font-bold">
        {alsoShowing}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-8">
        {SECONDARY_PERIODS.map(period => {
          const movie = movies?.[period];

          return (
            <div key={period} className="flex flex-col gap-2">
              {movie ? (
                <FilmCard
                  movie={movie}
                  variant="compact"
                  locale={locale}
                  label={periodLabels[period]}
                  transformImages={transformImages}
                />
              ) : (
                <p className="text-sm text-ink/50 font-label">{noMovieLabel}</p>
              )}
              {renderAdminControls(period)}
            </div>
          );
        })}
      </div>
      {locale === 'ja' && (
        <p className="mt-6 font-display text-base">
          <a href="/on-this-day" className="text-ink underline">
            今日初公開された映画
          </a>
        </p>
      )}
      {locale === 'ja' && (
        <p className="mt-2 font-display text-base">
          <a href="/tonight" className="text-ink underline">
            今夜90分で観られる1本
          </a>
        </p>
      )}
      {locale === 'ja' && (
        <p className="mt-2 font-display text-base">
          <a href="/double-feature" className="text-ink underline">
            今日の二本立て
          </a>
        </p>
      )}
      {locale === 'ja' && (
        <p className="mt-2 font-display text-base">
          <a href="/shiritori" className="text-ink underline">
            今日の映画しりとり
          </a>
        </p>
      )}
    </section>
  );
}

function NextMonthlyPick({
  movie,
  locale,
}: {
  movie: SelectionHistoryItem;
  locale: string;
}) {
  const [, month, day] = movie.selectionDate.split('-').map(Number);
  const isJapanese = locale === 'ja';

  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-display text-base">
      <span className="font-bold">
        {isJapanese ? '来月の1本' : 'Next month'}
      </span>
      <span className="text-ink-muted">
        {isJapanese ? `${month}月${day}日から` : `from ${month}/${day}`}
      </span>
      <a href={`/movies/${movie.uid}`} className="text-ink underline">
        {isJapanese ? `『${movie.title}』` : movie.title}
        {movie.year
          ? isJapanese
            ? `（${movie.year}年）`
            : ` (${movie.year})`
          : ''}
      </a>
    </p>
  );
}
