import type {
  MovieCardCeremony,
  MovieCardNomination,
  MovieCardOrganization,
} from './types';

type CeremonyGroup = {
  ceremony: MovieCardCeremony;
  nominations: MovieCardNomination[];
};

export type OrganizationGroup = {
  organization: MovieCardOrganization;
  ceremonies: CeremonyGroup[];
};

export function groupNominationsByOrganization(
  nominations: MovieCardNomination[],
): OrganizationGroup[] {
  const groups: OrganizationGroup[] = [];
  const groupsByOrganization = new Map<string, OrganizationGroup>();
  for (const nomination of nominations) {
    let group = groupsByOrganization.get(nomination.organization.uid);
    if (!group) {
      group = {organization: nomination.organization, ceremonies: []};
      groupsByOrganization.set(nomination.organization.uid, group);
      groups.push(group);
    }

    let ceremonyGroup = group.ceremonies.find(
      entry => entry.ceremony.uid === nomination.ceremony.uid,
    );
    if (!ceremonyGroup) {
      ceremonyGroup = {ceremony: nomination.ceremony, nominations: []};
      group.ceremonies.push(ceremonyGroup);
    }

    ceremonyGroup.nominations.push(nomination);
  }

  return groups;
}
