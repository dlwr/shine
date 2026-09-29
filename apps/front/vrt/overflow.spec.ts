import {expect, test} from '@playwright/test';
import {fixedNow} from './clock';
import {pages} from './pages';
import {frontPort} from './ports';

test.beforeEach(async ({page}) => {
  await page.clock.setFixedTime(fixedNow);
  await page.route('**/*', async route => {
    const {hostname} = new URL(route.request().url());
    await (hostname === 'localhost' ? route.continue() : route.abort());
  });
});

for (const path of pages) {
  test(`${path} は横にはみ出さない`, async ({page}) => {
    await page.goto(`http://localhost:${frontPort}${path}`);
    await page.evaluate(async () => document.fonts.ready);
    const overflow = await page.evaluate(() => {
      const {clientWidth, scrollWidth} = document.documentElement;
      const offenders = [...document.querySelectorAll('body *')]
        .filter(element => element.getBoundingClientRect().right > clientWidth)
        .slice(0, 10)
        .map(element => {
          const className =
            typeof element.className === 'string' ? element.className : '';
          const text = (element.textContent ?? '').trim().slice(0, 30);
          return `<${element.tagName.toLowerCase()} class="${className}"> ${text}`;
        });
      return {clientWidth, scrollWidth, offenders};
    });

    expect(
      overflow.scrollWidth,
      `scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}\n${overflow.offenders.join('\n')}`,
    ).toBeLessThanOrEqual(overflow.clientWidth);
  });
}
