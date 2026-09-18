/// <reference types="node" />
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function tokenValue(name: string): string | undefined {
  const block = /:root\s*\{([^}]*)\}/.exec(
    read('apps/front/app/styles/tokens.css'),
  )?.[1];

  return new RegExp(String.raw`--${name}:\s*(#[\da-f]{6});`, 'i').exec(
    block ?? '',
  )?.[1];
}

describe('brand 色の写し', () => {
  it('OG カードの赤がトークンと同じ', () => {
    const brand = /brand:\s*'(#[\da-f]{6})'/i.exec(
      read('apps/front/app/lib/og/template.ts'),
    )?.[1];

    expect(brand).toBe(tokenValue('brand'));
  });

  it('OG カードの文字色がトークンと同じ', () => {
    const brandOn = /brandOn:\s*'(#[\da-f]{6})'/i.exec(
      read('apps/front/app/lib/og/template.ts'),
    )?.[1];

    expect(brandOn).toBe(tokenValue('brand-on'));
  });

  it('favicon の下地がトークンと同じ', () => {
    const fill = /<rect[^>]*fill="(#[\da-f]{6})"/i.exec(
      read('apps/front/public/favicon.svg'),
    )?.[1];

    expect(fill).toBe(tokenValue('brand'));
  });
});
