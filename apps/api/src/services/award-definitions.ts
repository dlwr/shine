import {annualAwardPageDefinitions} from './award-definitions/award-pages-annual';
import {festivalAwardPageDefinitions} from './award-definitions/award-pages-festivals';
import {listAwardPageDefinitions} from './award-definitions/award-pages-lists';
import {festivalPersonAwardDefinitions} from './award-definitions/person-awards-festivals';
import {japanesePersonAwardDefinitions} from './award-definitions/person-awards-japan';
import {overseasPersonAwardDefinitions} from './award-definitions/person-awards-overseas';
import type {
  AwardPageDefinition,
  PersonAwardDefinition,
} from './award-definitions/types';

export {personAwardOrganizations} from './award-definitions/organizations';
export type {
  AwardPageDefinition,
  PersonAwardDefinition,
  PersonAwardOrganization,
} from './award-definitions/types';

export const personAwardDefinitions: PersonAwardDefinition[] = [
  ...overseasPersonAwardDefinitions,
  ...japanesePersonAwardDefinitions,
  ...festivalPersonAwardDefinitions,
];

export const awardPageDefinitions: AwardPageDefinition[] = [
  ...festivalAwardPageDefinitions,
  ...annualAwardPageDefinitions,
  ...listAwardPageDefinitions,
];
