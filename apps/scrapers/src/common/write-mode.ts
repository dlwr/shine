import {Option} from 'commander';

export const applyOption = () => new Option('--apply', '実際に書き込む');

export const dryRunOption = () =>
  new Option('--dry-run', '書き込みは行わず、対象のみ表示（既定）');

export function isDryRun(options: {apply?: boolean}): boolean {
  return options.apply !== true;
}
