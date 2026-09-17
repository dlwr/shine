import type {AwardOrganizationNames, PersonAwardOrganization} from './types';

export const academyAwards: AwardOrganizationNames = {
  organizationName: 'Academy Awards',
  organization: 'アカデミー賞',
};

export const bafta: AwardOrganizationNames = {
  organizationName: 'British Academy Film Awards',
  organization: '英国アカデミー賞',
};

export const goldenGlobe: AwardOrganizationNames = {
  organizationName: 'Golden Globe Awards',
  organization: 'ゴールデングローブ賞',
};

export const japanAcademy: AwardOrganizationNames = {
  organizationName: 'Japan Academy Awards',
  organization: '日本アカデミー賞',
};

export const kinemaJunpo: AwardOrganizationNames = {
  organizationName: 'Kinema Junpo',
  organization: 'キネマ旬報',
};

export const mainichi: AwardOrganizationNames = {
  organizationName: 'Mainichi Film Awards',
  organization: '毎日映画コンクール',
};

export const blueRibbon: AwardOrganizationNames = {
  organizationName: 'Blue Ribbon Awards',
  organization: 'ブルーリボン賞',
};

export const hochi: AwardOrganizationNames = {
  organizationName: 'Hochi Film Awards',
  organization: '報知映画賞',
};

export const yokohama: AwardOrganizationNames = {
  organizationName: 'Yokohama Film Festival',
  organization: 'ヨコハマ映画祭',
};

export const nikkanSports: AwardOrganizationNames = {
  organizationName: 'Nikkan Sports Film Awards',
  organization: '日刊スポーツ映画大賞',
};

export const cannes: AwardOrganizationNames = {
  organizationName: 'Cannes Film Festival',
  organization: 'カンヌ国際映画祭',
};

export const venice: AwardOrganizationNames = {
  organizationName: 'Venice Film Festival',
  organization: 'ヴェネツィア国際映画祭',
};

export const berlin: AwardOrganizationNames = {
  organizationName: 'Berlin International Film Festival',
  organization: 'ベルリン国際映画祭',
};

export const personAwardOrganizations: PersonAwardOrganization[] = [
  {
    key: 'academy',
    organizationName: academyAwards.organizationName,
    shortLabel: 'アカデミー',
  },
  {
    key: 'bafta',
    organizationName: bafta.organizationName,
    shortLabel: 'BAFTA',
  },
  {
    key: 'golden-globe',
    organizationName: goldenGlobe.organizationName,
    shortLabel: 'GG',
  },
  {
    key: 'cannes',
    organizationName: cannes.organizationName,
    shortLabel: 'カンヌ',
  },
  {
    key: 'venice',
    organizationName: venice.organizationName,
    shortLabel: 'ヴェネツィア',
  },
  {
    key: 'berlin',
    organizationName: berlin.organizationName,
    shortLabel: 'ベルリン',
  },
  {
    key: 'japan-academy',
    organizationName: japanAcademy.organizationName,
    shortLabel: '日本アカデミー',
  },
  {
    key: 'kinema-junpo',
    organizationName: kinemaJunpo.organizationName,
    shortLabel: 'キネ旬',
  },
  {
    key: 'mainichi',
    organizationName: mainichi.organizationName,
    shortLabel: '毎日',
  },
  {
    key: 'blue-ribbon',
    organizationName: blueRibbon.organizationName,
    shortLabel: 'ブルーリボン',
  },
  {
    key: 'hochi',
    organizationName: hochi.organizationName,
    shortLabel: '報知',
  },
  {
    key: 'yokohama',
    organizationName: yokohama.organizationName,
    shortLabel: 'ヨコハマ',
  },
  {
    key: 'nikkan-sports',
    organizationName: nikkanSports.organizationName,
    shortLabel: '日刊',
  },
];
