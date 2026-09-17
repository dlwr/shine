export type AwardOrganizationNames = {
  organizationName: string;
  organization: string;
};

export type PersonAwardDefinition = {
  slug: string;
  organizationName: string;
  categoryNames: string[];
  name: string;
  organization: string;
  /** DBの部門名が日本語でないときの表示名 */
  categoryLabel?: string;
  description: string;
  role: 'director' | 'actor';
};

export type PersonAwardOrganization = {
  key: string;
  organizationName: string;
  shortLabel: string;
};

export type AwardPageDefinition = {
  slug: string;
  shortLabel: string;
  organizationName: string;
  categoryNames: string[];
  name: string;
  organization: string;
  description: string;
  grouping: 'year' | 'list';
  /** 最高賞に次ぐ賞。受賞作は同じ映画祭の出品作でもあるので、作品を横断して数える集計には入れない */
  subAward?: boolean;
};
