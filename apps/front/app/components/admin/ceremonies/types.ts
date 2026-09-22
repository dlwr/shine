import type {
  AdminAwardsReferenceData,
  AdminCeremonyDetailData,
  AdminCeremonyListItemData,
  AdminMovieListItemData,
} from '@/lib/api-types';

export type CeremonyResponse = AdminCeremonyDetailData;

export type CeremonyNavigationItem = NonNullable<
  CeremonyResponse['navigation']['previous']
>;

export type AwardsData = Pick<
  AdminAwardsReferenceData,
  'organizations' | 'categories'
>;
export type AwardsOrganization = AwardsData['organizations'][number];
export type AwardsCategory = AwardsData['categories'][number];

export type MovieSearchResult = AdminMovieListItemData;

export type CeremonyListItem = AdminCeremonyListItemData;

export type OrganizationOption = {
  value: string;
  label: string;
};
