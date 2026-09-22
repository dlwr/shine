import type {AdminAwardsReferenceData} from '@/lib/api-types';
import type {MovieDetails} from '@/components/admin/movie-info/types';

export type Nomination = MovieDetails['nominations'][number];

export type AwardsData = AdminAwardsReferenceData;
export type AwardsOrganization = AwardsData['organizations'][number];
export type AwardsCeremony = AwardsData['ceremonies'][number];
export type AwardsCategory = AwardsData['categories'][number];
