import process from 'node:process';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createAwardImportCommand} from '../award-import-cli';

const awards = [{category: 'Best Director'}, {category: 'Best Actor'}];

const buildCommand = (failed = 0) => {
  const importAwards = vi.fn(async () => ({failed}));
  const command = createAwardImportCommand({
    name: 'sample-awards',
    description: ['説明'],
    firstYear: 1946,
    awards,
    importAwards,
  }).exitOverride();
  command.configureOutput({writeErr() {}});
  return {command, importAwards};
};

describe('createAwardImportCommand', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('--category で指定した部門だけを取り込みに渡す', async () => {
    const {command, importAwards} = buildCommand();

    await command.parseAsync(['--dry-run', '--category', 'Best Actor'], {
      from: 'user',
    });

    expect(importAwards).toHaveBeenCalledWith(
      expect.objectContaining({awards: [{category: 'Best Actor'}]}),
    );
  });

  it('--category が無ければ部門を絞らない', async () => {
    const {command, importAwards} = buildCommand();

    await command.parseAsync(['--dry-run'], {from: 'user'});

    expect(importAwards).toHaveBeenCalledWith(
      expect.objectContaining({awards: undefined}),
    );
  });

  it('--year と --throttle を数値で渡す', async () => {
    const {command, importAwards} = buildCommand();

    await command.parseAsync(
      ['--dry-run', '--year', '2025', '--throttle', '0'],
      {from: 'user'},
    );

    expect(importAwards).toHaveBeenCalledWith(
      expect.objectContaining({year: 2025, throttleMs: 0, dryRun: true}),
    );
  });

  it('最初の年より前の --year は弾く', async () => {
    const {command} = buildCommand();

    await expect(
      command.parseAsync(['--dry-run', '--year', '1945'], {from: 'user'}),
    ).rejects.toThrow('yearは1946以上の整数で指定してください。');
  });

  it('取り込みに失敗した件があれば終了コードを 1 にする', async () => {
    const {command} = buildCommand(1);

    await command.parseAsync(['--dry-run'], {from: 'user'});

    expect(process.exitCode).toBe(1);
  });
});
