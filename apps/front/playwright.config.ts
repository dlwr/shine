import {defineConfig} from '@playwright/test';
import {apiPort, frontPort} from './vrt/ports';

export default defineConfig({
  testDir: './vrt',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', {open: 'never'}]] : 'list',
  expect: {
    toHaveScreenshot: {animations: 'disabled', maxDiffPixelRatio: 0.01},
  },
  use: {
    deviceScaleFactor: 1,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  },
  projects: [
    {name: 'mobile', use: {viewport: {width: 375, height: 812}}},
    {
      name: 'desktop',
      use: {viewport: {width: 1280, height: 900}},
      testIgnore: /overflow/,
    },
  ],
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
