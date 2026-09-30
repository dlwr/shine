import {expect, test} from '@playwright/test';
import {openPage, preparePage} from './page-setup';

test.beforeEach(async ({page}) => {
  await preparePage(page);
  await page.addInitScript(() => {
    localStorage.setItem('adminToken', 'vrt-admin-token');
  });
});

test('管理者のボタンはヘッダのボタンに重ならない', async ({page}) => {
  await openPage(page, '/');
  const adminControls = [
    page.getByRole('link', {name: '管理者'}),
    page.getByRole('button', {name: 'ログアウト'}),
  ];
  const header = page.locator('header').first();
  const headerControls = await header
    .locator('a:visible, button:visible')
    .all();

  for (const adminControl of adminControls) {
    const adminBox = await adminControl.boundingBox();
    expect(adminBox).not.toBeNull();
    for (const headerControl of headerControls) {
      const box = await headerControl.boundingBox();
      if (!adminBox || !box) {
        continue;
      }

      const isOverlaps =
        adminBox.x < box.x + box.width &&
        box.x < adminBox.x + adminBox.width &&
        adminBox.y < box.y + box.height &&
        box.y < adminBox.y + adminBox.height;
      expect(
        isOverlaps,
        `${await adminControl.textContent()} と ${await headerControl.textContent()} が重なる`,
      ).toBe(false);
    }
  }
});
