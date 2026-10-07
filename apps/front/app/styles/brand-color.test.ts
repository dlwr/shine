/// <reference types="node" />
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function tokenValue(
  name: string,
  selector: RegExp = /:root\s*\{([^}]*)\}/,
): string | undefined {
  const block = selector.exec(read('apps/front/app/styles/tokens.css'))?.[1];

  return new RegExp(String.raw`--${name}:\s*(#[\da-f]{6});`, 'i').exec(
    block ?? '',
  )?.[1];
}

const DARK = /\.dark\s*\{([^}]*)\}/;

describe('brand 色の写し', () => {
  it('OG カードの赤が暗いテーマのトークンと同じ', () => {
    const brand = /brand:\s*'(#[\da-f]{6})'/i.exec(
      read('apps/front/app/og/render/template.ts'),
    )?.[1];

    expect(brand).toBe(tokenValue('brand', DARK));
  });

  it('OG カードの背景が暗いテーマのトークンと同じ', () => {
    const paper = /paper:\s*'(#[\da-f]{6})'/i.exec(
      read('apps/front/app/og/render/template.ts'),
    )?.[1];

    expect(paper).toBe(tokenValue('paper', DARK));
  });

  it('favicon の下地がトークンと同じ', () => {
    const fill = /<rect[^>]*fill="(#[\da-f]{6})"/i.exec(
      read('apps/front/public/favicon.svg'),
    )?.[1];

    expect(fill).toBe(tokenValue('brand'));
  });
});
