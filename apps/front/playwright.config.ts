import {defineConfig} from '@playwright/test';
import {apiPort, frontPort} from './vrt/ports';

export default defineConfig({
  testDir: './vrt',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', {open: 'never'}]] : 'list',
  use: {
    viewport: {width: 375, height: 812},
    deviceScaleFactor: 1,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  },
  webServer: [
    {
      command: `tsx vrt/setup.ts && wrangler dev --config vrt/wrangler.api.jsonc --persist-to vrt/.state --port ${apiPort}`,
      url: `http://localhost:${apiPort}/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `wrangler dev --config vrt/.generated/wrangler.front.json --port ${frontPort}`,
      url: `http://localhost:${frontPort}/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
