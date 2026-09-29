import {expect, test} from '@playwright/test';
import {openPage, preparePage} from './page-setup';
import {pages} from './pages';

test.beforeEach(async ({page}) => {
  await preparePage(page);
});

for (const path of pages) {
  test(`${path} は横にはみ出さない`, async ({page}) => {
    await openPage(page, path);
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
