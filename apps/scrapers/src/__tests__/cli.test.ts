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

const sourceDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const cliFiles = readdirSync(sourceDirectory)
  .filter(file => file.endsWith('-cli.ts'))
  .sort();

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

  it('全ての *-cli.ts をサブコマンドとして持つ', async () => {
    const names = createProgram().commands.map(command => command.name());
    const expected = await Promise.all(
      cliFiles.map(async file => {
        const module = (await import(`../${file}`)) as {
          createCommand: () => Command;
        };
        return module.createCommand().name();
      }),
    );

    expect([...names].sort()).toEqual([...expected].sort());
    expect(names).toHaveLength(cliFiles.length);
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

describe.each(cliFiles)('%s', file => {
  it('createCommand を export し、呼んでも env と DB に触れない', async () => {
    vi.mocked(config).mockClear();
    vi.mocked(getDatabase).mockClear();

    const module = (await import(`../${file}`)) as {
      createCommand?: () => Command;
    };

    expect(typeof module.createCommand).toBe('function');

    const command = module.createCommand!();

    expect(command.name()).toBe(
      file
        .replace(/-cli\.ts$/, '')
        .replace('movie-import-from-list', 'movie-import'),
    );
    expect(config).not.toHaveBeenCalled();
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it('--help を表示できる', async () => {
    vi.mocked(config).mockClear();
    vi.mocked(getDatabase).mockClear();

    const module = (await import(`../${file}`)) as {
      createCommand: () => Command;
    };
    const command = module.createCommand();
    const output = await runHelp(command);

    expect(output).toContain(`Usage: ${command.name()}`);
    expect(config).not.toHaveBeenCalled();
    expect(getDatabase).not.toHaveBeenCalled();
  });
});
