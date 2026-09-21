import {
  type AwardEdition,
  type PersonAwardEntry,
} from './common/award-table-types';
import {parsePersonAwardWikitext} from './common/award-table-wikitext';

export type AcademyPersonEdition = AwardEdition<PersonAwardEntry>;

const ACADEMY_TABLE = {ceremonyPage: 'Academy Awards'};

export function parseAcademyPersonWikitext(
  wikitext: string,
): AcademyPersonEdition[] {
  return parsePersonAwardWikitext(wikitext, ACADEMY_TABLE);
}
