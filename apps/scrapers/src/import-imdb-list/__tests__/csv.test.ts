import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {readUniqueCsvRecords} from '../csv';

let temporaryDirectories: string[] = [];

async function writeCsv(content: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-csv-'));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, 'list.csv');
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('readUniqueCsvRecords', () => {
  it('ヘッダ行を列名にして読む', async () => {
    const filePath = await writeCsv(
      'Const,Title,Original Title,Year\ntt0111161,ショーシャンクの空に,The Shawshank Redemption,1994\n',
    );

    expect(readUniqueCsvRecords(filePath)).toEqual([
      {
        Const: 'tt0111161',
        Title: 'ショーシャンクの空に',
        'Original Title': 'The Shawshank Redemption',
        Year: '1994',
      },
    ]);
  });

  it('同じ IMDb ID は最初の行だけ残す', async () => {
    const filePath = await writeCsv(
      'Const,Title\ntt0000001,first\ntt0000002,second\ntt0000001,again\n',
    );

    expect(readUniqueCsvRecords(filePath).map(row => row.Title)).toEqual([
      'first',
      'second',
    ]);
  });

  it('Const が空の行と空行を捨てる', async () => {
    const filePath = await writeCsv(
      'Const,Title\n,no id\n\ntt0000001,kept\n   ,blank\n',
    );

    expect(readUniqueCsvRecords(filePath).map(row => row.Const)).toEqual([
      'tt0000001',
    ]);
  });

  it('値の前後の空白を取り除く', async () => {
    const filePath = await writeCsv('Const,Title\n  tt0000001 ,  Film  \n');

    expect(readUniqueCsvRecords(filePath)).toEqual([
      {Const: 'tt0000001', Title: 'Film'},
    ]);
  });
});
