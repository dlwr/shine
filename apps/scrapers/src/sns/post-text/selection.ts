import {formatTitle} from './framing';

const MAX_ORGANIZATIONS = 2;

export type SelectionPostInput = {
  title: string;
  year?: number;
  organizations: string[];
  availabilityLabels: string[];
};

export function buildSelectionLines(
  heading: string,
  {title, year, organizations, availabilityLabels}: SelectionPostInput,
): string[] {
  const lines = [`${heading} —${formatTitle(title, year)}`];

  if (organizations.length > 0) {
    lines.push(`${organizations.slice(0, MAX_ORGANIZATIONS).join('・')} 選出`);
  }

  if (availabilityLabels.length > 0) {
    lines.push(`▶ ${availabilityLabels.join(' / ')}`);
  }

  return lines;
}
