import {Option} from 'commander';

export type WriteModeOptions = {
  apply?: boolean;
  dryRun?: boolean;
};

export const applyOption = () => new Option('--apply', '実際に書き込む');

export const dryRunOption = () =>
  new Option('--dry-run', '書き込みは行わず、対象のみ表示（既定）');

export function isDryRun(options: WriteModeOptions): boolean {
  return options.dryRun === true || options.apply !== true;
}
