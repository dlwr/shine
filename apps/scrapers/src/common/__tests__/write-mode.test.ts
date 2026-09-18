import {Command} from 'commander';
import {describe, expect, it} from 'vitest';
import {applyOption, dryRunOption, isDryRun} from '../write-mode';

const parse = (argv: string[]) => {
  const command = new Command()
    .name('repair')
    .addOption(applyOption())
    .addOption(dryRunOption());
  command.parse(argv, {from: 'user'});
  return command.opts();
};

describe('isDryRun', () => {
  it('--apply が無ければ dry-run', () => {
    expect(isDryRun(parse([]))).toBe(true);
  });

  it('--apply があれば書き込む', () => {
    expect(isDryRun(parse(['--apply']))).toBe(false);
  });

  it('--dry-run を明示しても dry-run', () => {
    expect(isDryRun(parse(['--dry-run']))).toBe(true);
  });

  it('--apply と --dry-run を両方付けたら dry-run', () => {
    expect(isDryRun(parse(['--apply', '--dry-run']))).toBe(true);
  });
});

describe('dryRunOption', () => {
  it('既存の --dry-run 付きの呼び出しを受け付ける', () => {
    expect(() => parse(['--dry-run'])).not.toThrow();
  });
});
