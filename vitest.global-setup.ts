import {mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export default function setup() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'shine-vitest-'));
  const original = process.env.TMPDIR;
  process.env.TMPDIR = directory;

  return () => {
    process.env.TMPDIR = original;
    rmSync(directory, {recursive: true, force: true});
  };
}
