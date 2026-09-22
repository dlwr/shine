import type {AdminCeremoniesService} from '../services/admin-ceremonies-service';
import type {fetchAdminMovieDetail} from '../services/admin-movie-detail';
import type {PeriodPreview} from '../services/selections-service';

/**
 * 管理ルートの応答の形。front は `apps/front/app/lib/api-types.ts` からこの型を引く
 */

export type AdminMovieDetail = Awaited<
  ReturnType<typeof fetchAdminMovieDetail>
>;

export type AdminMovieListItem = {
  uid: string;
  year: number | null;
  originalLanguage: string;
  imdbId: string | null;
  mediaType: string;
  title: string;
  posterUrl: string | null;
  imdbUrl: string | undefined;
  nominationCount: number;
};

export type AdminMoviesListResponse = {
  movies: AdminMovieListItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
};

export type CreateMovieResponse = {
  success: true;
  movie: {
    uid: string;
    imdbId: string | undefined;
    tmdbId: number | undefined;
    year: number | undefined;
    originalLanguage: string | null;
  };
  imports: {
    translationsAdded: number;
    postersAdded: number;
  };
};

export type AdminCeremonyListItem = Awaited<
  ReturnType<AdminCeremoniesService['listCeremonies']>
>[number];

export type AdminCeremoniesListResponse = {
  ceremonies: AdminCeremonyListItem[];
};

export type AdminCeremonyDetail = Awaited<
  ReturnType<AdminCeremoniesService['getCeremonyDetail']>
>;

export type AdminAwardsReference = Awaited<
  ReturnType<AdminCeremoniesService['getAwardsReference']>
>;

export type ExternalIdSearchResponse = {
  usedQuery: string;
  usedYear?: number;
  results: Array<{
    tmdbId: number;
    imdbId?: string;
    title: string;
    originalTitle?: string;
    releaseDate?: string;
    overview?: string;
    originalLanguage?: string;
    posterPath?: string;
    popularity?: number;
    voteAverage?: number;
    voteCount?: number;
    yearDifference?: number;
  }>;
};

export type PreviewSelectionsResponse = {
  nextDaily: PeriodPreview;
  nextWeekly: PeriodPreview;
  nextMonthly: PeriodPreview;
};
