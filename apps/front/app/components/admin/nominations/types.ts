import type {MovieDetails} from '../../../routes/admin.movies.$id';

export type Nomination = MovieDetails['nominations'][number];

export type AwardsOrganization = {
  uid: string;
  name: string;
  country: string | null;
  shortName?: string | null;
};

export type AwardsCeremony = {
  uid: string;
  organizationUid: string;
  year: number;
  ceremonyNumber: number | null;
  organizationName: string;
};

export type AwardsCategory = {
  uid: string;
  organizationUid: string;
  name: string;
  organizationName: string;
};

export type AwardsData = {
  organizations: AwardsOrganization[];
  ceremonies: AwardsCeremony[];
  categories: AwardsCategory[];
};
