export type CeremonyNavigationItem = {
  uid: string;
  year: number;
  ceremonyNumber?: number;
};

export type CeremonyResponse = {
  ceremony: {
    uid: string;
    organizationUid: string;
    organizationName: string;
    organizationCountry: string | null;
    year: number;
    ceremonyNumber: number | null;
    startDate: number | null;
    endDate: number | null;
    location: string | null;
    description: string | null;
    imdbEventUrl: string | null;
    createdAt: number;
    updatedAt: number;
  };
  nominations: Array<{
    uid: string;
    movie: {
      uid: string;
      title: string;
      year: number | null;
    };
    category: {
      uid: string;
      name: string;
    };
    isWinner: boolean;
    specialMention: string | null;
  }>;
  navigation: {
    previous: CeremonyNavigationItem | null;
    next: CeremonyNavigationItem | null;
  };
};

export type AwardsOrganization = {
  uid: string;
  name: string;
  country: string | null;
  shortName: string | null;
};

export type AwardsCategory = {
  uid: string;
  organizationUid: string;
  name: string;
};

export type AwardsData = {
  organizations: AwardsOrganization[];
  categories: AwardsCategory[];
};

export type MovieSearchResult = {
  uid: string;
  title: string;
  year: number | null;
  imdbUrl?: string | null;
};
