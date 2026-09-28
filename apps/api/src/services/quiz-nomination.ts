import {
  findAwardPageDefinition,
  japaneseAwardNames,
  japaneseOrganizationName,
} from './award-definition-lookup';

/** 賞ページ定義のorganizationが英語のままのもの */
const organizationLabelOverrides: Record<string, string> = {
  '1001 Movies You Must See Before You Die': '死ぬまでに観たい映画1001本',
};

export type NominationFacts = {
  organizationName: string;
  categoryName: string;
  ceremonyYear: number;
  isWinner: boolean;
  specialMention: string | undefined;
};

export function describeNomination(facts: NominationFacts): {
  organization: string;
  achievement: string;
} {
  const definition = findAwardPageDefinition(
    facts.organizationName,
    facts.categoryName,
  );
  const organization =
    organizationLabelOverrides[facts.organizationName] ??
    definition?.organization ??
    japaneseOrganizationName(facts.organizationName) ??
    facts.organizationName;

  if (definition?.grouping === 'list') {
    return {organization, achievement: `${organization}に選出`};
  }

  const outcome =
    facts.specialMention ?? (facts.isWinner ? '受賞' : 'ノミネート');
  // 賞ページを持たない部門（個人賞など）は部門名を出さないと作品賞と区別できない
  const category =
    japaneseAwardNames(facts.organizationName, facts.categoryName).category ??
    facts.categoryName;
  const award = definition ? organization : `${organization} ${category}`;

  return {
    organization,
    achievement: `${award} ${facts.ceremonyYear}年 ${outcome}`,
  };
}
