import {readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {type Command} from 'commander';
import {config} from 'dotenv';
import {getDatabase} from '@shine/database';
import {describe, expect, it, vi} from 'vitest';
import {createProgram} from '../cli';

vi.mock('dotenv', () => ({config: vi.fn()}));
vi.mock('@shine/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@shine/database')>()),
  getDatabase: vi.fn(),
}));

type CliModule = {createCommand?: () => Command};

const callsAtImport = {
  config: vi.mocked(config).mock.calls.length,
  getDatabase: vi.mocked(getDatabase).mock.calls.length,
};

const sourceDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const cliStems = readdirSync(sourceDirectory)
  .filter(file => file.endsWith('-cli.ts'))
  .map(file => file.replace(/-cli\.ts$/, ''))
  .toSorted((a, b) => a.localeCompare(b));

const byName = (a: string, b: string) => a.localeCompare(b);

async function loadCliModule(stem: string): Promise<CliModule> {
  return (await import(`../${stem}-cli.ts`)) as CliModule;
}

async function runHelp(command: Command): Promise<string> {
  let output = '';
  command.exitOverride();
  command.configureOutput({
    writeOut(text) {
      output += text;
    },
  });

  await expect(
    command.parseAsync(['--help'], {from: 'user'}),
  ).rejects.toMatchObject({code: 'commander.helpDisplayed'});

  return output;
}

describe('createProgram', () => {
  it('scrapers という名前の root コマンドを返す', () => {
    expect(createProgram().name()).toBe('scrapers');
  });

  it('import しただけでは env と DB に触れない', () => {
    expect(callsAtImport).toEqual({config: 0, getDatabase: 0});
  });

  it('全ての *-cli.ts をサブコマンドとして持つ', async () => {
    const names = createProgram().commands.map(command => command.name());
    const expected = await Promise.all(
      cliStems.map(async stem => {
        const module = await loadCliModule(stem);
        return module.createCommand!().name();
      }),
    );

    expect(names.toSorted(byName)).toEqual(expected.toSorted(byName));
    expect(names).toHaveLength(cliStems.length);
  });

  it('サブコマンド名が一意である', () => {
    const names = createProgram().commands.map(command => command.name());

    expect(new Set(names).size).toBe(names.length);
  });

  it('root の --help に全サブコマンドが載る', async () => {
    const program = createProgram();
    const output = await runHelp(program);

    for (const command of program.commands) {
      expect(output).toContain(command.name());
    }
  });
});

describe.each(cliStems)('%s-cli.ts', stem => {
  it('createCommand を export し、呼んでも env と DB に触れない', async () => {
    const module = await loadCliModule(stem);

    expect(typeof module.createCommand).toBe('function');

    const command = module.createCommand!();

    expect(command.name()).toBe(
      stem.replace('movie-import-from-list', 'movie-import'),
    );
    expect(config).not.toHaveBeenCalled();
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it('--help を表示できる', async () => {
    const module = await loadCliModule(stem);
    const command = module.createCommand!();
    const output = await runHelp(command);

    expect(output).toContain(`Usage: ${command.name()}`);
    expect(config).not.toHaveBeenCalled();
    expect(getDatabase).not.toHaveBeenCalled();
  });
});
