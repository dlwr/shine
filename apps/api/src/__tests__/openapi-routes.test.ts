import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {parse} from 'yaml';
import app from '../index';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

const openapiPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../openapi.yml',
);

function normalizePath(routePath: string): string {
  return routePath
    .replaceAll(/:\w+/g, '{}')
    .replaceAll(/\{\w+\}/g, '{}')
    .replace(/(.)\/$/, '$1');
}

function implementedRoutes(): string[] {
  const routes = new Set<string>();
  for (const route of app.routes) {
    const method = route.method.toLowerCase();
    if (HTTP_METHODS.has(method)) {
      routes.add(`${method.toUpperCase()} ${normalizePath(route.path)}`);
    }
  }

  return [...routes];
}

function documentedRoutes(): string[] {
  const document = parse(readFileSync(openapiPath, 'utf8')) as {
    paths: Record<string, Record<string, unknown>>;
  };
  const routes = new Set<string>();
  for (const [routePath, operations] of Object.entries(document.paths)) {
    for (const method of Object.keys(operations)) {
      if (HTTP_METHODS.has(method)) {
        routes.add(`${method.toUpperCase()} ${normalizePath(routePath)}`);
      }
    }
  }

  return [...routes];
}

describe('openapi.yml', () => {
  it('実装されたルートを全部載せている', () => {
    const documented = new Set(documentedRoutes());

    expect(implementedRoutes().filter(route => !documented.has(route))).toEqual(
      [],
    );
  });

  it('実装に無いルートを載せていない', () => {
    const implemented = new Set(implementedRoutes());

    expect(documentedRoutes().filter(route => !implemented.has(route))).toEqual(
      [],
    );
  });
});
