import type {RelatedMovie} from '@shine/api/services/related-movies';
import type {SelectionHistoryItem} from '@shine/api/services/selection-history';
import type {PeriodPreview} from '@shine/api/services/selections-service';
import type {
  AdminAwardsReference,
  AdminCeremonyDetail,
  AdminCeremonyListItem,
  AdminMovieDetail,
  AdminMovieListItem,
  AdminMoviesListResponse,
  CreateMovieResponse,
  ExternalIdSearchResponse,
  PreviewSelectionsResponse,
} from '@shine/api/types/admin';
import type {
  AwardDetail,
  AwardSummary,
  AwardYearDetail,
  PersonAwardDetail,
} from '@shine/api/types/awards';
import type {AwardCrossings, PersonCrossings} from '@shine/api/types/crossings';
import type {
  PeopleSearchResult,
  PersonDetail,
  ProminentPeople,
  ProminentPerson,
} from '@shine/api/types/people';
import type {
  AwardsListResponse,
  MovieDetail,
  MovieSearchResponse,
  QuizDailyResponse,
  SelectionsResponse,
  WatchedListsResponse,
  YearsListResponse,
} from '@shine/api/types/responses';
import type {PersonUncrowned, Uncrowned} from '@shine/api/types/uncrowned';
import type {YearDetail, YearSummary} from '@shine/api/types/years';

type UndefinableKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? K : never;
}[keyof T];

type Flatten<T> = {[K in keyof T]: T[K]} & {};

/**
 * API の応答が JSON を経て届いた形。`x: T | undefined` のプロパティは JSON で落ちるので省略可能になる
 */
type Json<T> =
  T extends Array<infer U>
    ? Array<Json<U>>
    : T extends object
      ? Flatten<
          {[K in Exclude<keyof T, UndefinableKeys<T>>]: Json<T[K]>} & {
            [K in UndefinableKeys<T>]?: Json<Exclude<T[K], undefined>>;
          }
        >
      : T;

export type AwardSummaryData = Json<AwardSummary>;
export type AwardsListData = Json<AwardsListResponse>;
export type AwardDetailData = Json<AwardDetail>;
export type AwardYearGroupData = AwardDetailData['years'][number];
export type AwardMovieEntryData = AwardYearGroupData['movies'][number];
export type AwardPaginationData = NonNullable<AwardDetailData['pagination']>;
export type AwardYearDetailData = Json<AwardYearDetail>;
export type PersonAwardDetailData = Json<PersonAwardDetail>;
export type PersonAwardYearGroupData = PersonAwardDetailData['years'][number];
export type AwardPageData = AwardDetailData | PersonAwardDetailData;
export type WatchedListsData = Json<WatchedListsResponse>;

export type YearSummaryData = Json<YearSummary>;
export type YearsListData = Json<YearsListResponse>;
export type YearDetailData = Json<YearDetail>;

export type CrossingsData = Json<AwardCrossings>;
export type UncrownedData = Json<Uncrowned>;
export type PersonCrossingsData = Json<PersonCrossings>;
export type PersonUncrownedData = Json<PersonUncrowned>;

export type ProminentPersonData = Json<ProminentPerson>;
export type ProminentPeopleData = Json<ProminentPeople>;
export type PeopleSearchData = Json<PeopleSearchResult>;
export type PersonData = Json<PersonDetail>;

export type MovieDetailData = Json<MovieDetail>;
export type RelatedMovieData = Json<RelatedMovie>;
export type MovieSearchData = Json<MovieSearchResponse>;
export type SelectionsData = Json<SelectionsResponse>;
export type SelectionHistoryItemData = Json<SelectionHistoryItem>;
export type SelectionPreviewData = Json<PeriodPreview>;
export type PreviewSelectionsData = Json<PreviewSelectionsResponse>;

export type AdminMovieDetailData = Json<AdminMovieDetail>;
export type AdminMovieListItemData = Json<AdminMovieListItem>;
export type AdminMoviesListData = Json<AdminMoviesListResponse>;
export type CreateMovieData = Json<CreateMovieResponse>;
export type AdminCeremonyListItemData = Json<AdminCeremonyListItem>;
export type AdminCeremonyDetailData = Json<AdminCeremonyDetail>;
export type AdminAwardsReferenceData = Json<AdminAwardsReference>;
export type ExternalIdSearchData = Json<ExternalIdSearchResponse>;
export type QuizDailyData = Json<QuizDailyResponse>;
