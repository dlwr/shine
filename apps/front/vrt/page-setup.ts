import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {Page} from '@playwright/test';
import {fixedNow} from './clock';
import {frontPort} from './ports';

const poster = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'fixtures/poster.png',
  ),
);

export const preparePage = async (page: Page) => {
  await page.clock.setFixedTime(fixedNow);
  await page.route('**/*', async route => {
    const request = route.request();
    const {hostname} = new URL(request.url());
    if (hostname === 'localhost') {
      await route.continue();
    } else if (request.resourceType() === 'image') {
      await route.fulfill({contentType: 'image/png', body: poster});
    } else {
      await route.abort();
    }
  });
};

export const openPage = async (page: Page, pathname: string) => {
  await page.goto(`http://localhost:${frontPort}${pathname}`);
  await page.evaluate(async () => {
    const images = [...document.images];
    for (const image of images) {
      image.loading = 'eager';
    }

    await Promise.all(
      images.map(async image => {
        try {
          await image.decode();
        } catch {
          return;
        }
      }),
    );
    await document.fonts.ready;
  });
};
