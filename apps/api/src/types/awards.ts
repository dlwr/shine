import type {
  JapanAvailabilityStatus,
  JapanAvailabilitySummary,
  Pagination,
  WatchableAvailability,
} from './common';

export type AwardMovieEntry = {
  uid: string;
  title: string | undefined;
  movieYear: number | undefined;
  posterUrl: string | undefined;
  isWinner: boolean;
  /** ランキング形式の賞で「N位」が入る */
  specialMention?: string;
  availabilityStatus: JapanAvailabilityStatus;
  /** 年別ページでのみ返る。観られると判定された視聴手段 */
  availability?: WatchableAvailability[];
};

export type AwardYearGroup = {
  year: number;
  ceremonyNumber: number | undefined;
  /** その回の全出品作数。moviesは年別グルーピングでは受賞作のみを含む */
  filmCount: number;
  movies: AwardMovieEntry[];
};

export type AwardDetail = {
  slug: string;
  name: string;
  organization: string;
  description: string;
  grouping: 'year' | 'list';
  /** 映画祭のグランプリ・審査員賞など最高賞に次ぐ賞のときのみ true */
  subAward?: boolean;
  /** 受賞作だけでなくノミネート作も含めた全作品の集計 */
  availabilitySummary: JapanAvailabilitySummary;
  years: AwardYearGroup[];
  /** grouping === 'list' のときのみ返る */
  pagination?: Pagination;
};

export type AwardYearDetail = {
  slug: string;
  name: string;
  organization: string;
  description: string;
  year: number;
  ceremonyNumber: number | undefined;
  availabilitySummary: JapanAvailabilitySummary;
  movies: AwardMovieEntry[];
  previousYear: number | undefined;
  nextYear: number | undefined;
};

export type AwardUnavailableMovie = {
  uid: string;
  title: string | undefined;
  movieYear: number | undefined;
  posterUrl: string | undefined;
  isWinner: boolean;
  /** 授賞式の年。新しい順 */
  ceremonyYears: number[];
};

/** 日本で観られない（最新の確認が全部 ng の）受賞作・ノミネート作の一覧 */
export type AwardUnavailableList = {
  slug: string;
  name: string;
  organization: string;
  description: string;
  grouping: 'year' | 'list';
  subAward?: boolean;
  availabilitySummary: JapanAvailabilitySummary;
  movies: AwardUnavailableMovie[];
};

export type AwardSummary = {
  slug: string;
  name: string;
  organization: string;
  description: string;
  grouping: 'year' | 'list' | 'person';
  movieCount: number;
  /** grouping === 'person' のときのみ返る */
  personCount?: number;
  /** 映画祭のグランプリ・審査員賞など最高賞に次ぐ賞のときのみ true */
  subAward?: boolean;
  firstYear: number;
  lastYear: number;
};

export type WatchedList = AwardSummary & {
  /** 受賞作の uid。授賞式の年の昇順、同じ年は uid の昇順（共有 URL のビット列の並び） */
  uids: string[];
};

export type PersonAwardNominee = {
  uid: string;
  name: string;
  originalName: string;
  profilePath: string | undefined;
  isWinner: boolean;
  movies: Array<{
    uid: string;
    title: string | undefined;
    movieYear: number | undefined;
  }>;
};

export type PersonAwardYearGroup = {
  year: number;
  ceremonyNumber: number | undefined;
  nominees: PersonAwardNominee[];
};

export type PersonAwardDetail = {
  slug: string;
  name: string;
  organization: string;
  description: string;
  grouping: 'person';
  years: PersonAwardYearGroup[];
};
