import {expect, test} from '@playwright/test';
import {openPage, preparePage} from './page-setup';
import {pages} from './pages';

const screenshotName = (pathname: string) =>
  `${pathname.slice(1).replaceAll(/[/?=]+/g, '-') || 'home'}.png`;

test.beforeEach(async ({page}) => {
  await preparePage(page);
});

for (const pathname of pages) {
  test(`${pathname} の見た目`, async ({page}) => {
    await openPage(page, pathname);
    await expect(page).toHaveScreenshot(screenshotName(pathname), {
      fullPage: true,
    });
  });
}

test('明るいテーマのホーム', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('shine-theme', 'light');
  });
  await openPage(page, '/');
  await expect(page).toHaveScreenshot('home-light.png', {fullPage: true});
});

test('メニューを開いたところ', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await openPage(page, '/');
  await page.getByRole('button', {name: 'メニュー'}).click();
  await expect(page).toHaveScreenshot('menu-open.png');
});
