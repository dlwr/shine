import {test, expect} from '@playwright/test';

test('Debug admin movie edit page', async ({page}) => {
  const ADMIN_PASSWORD = '*6J6vEVEMkFp8';

  // Listen to console logs
  page.on('console', message => {
    console.log('Console:', message.type(), message.text());
  });

  // Listen to page errors
  page.on('pageerror', exception => {
    console.log('Page error:', exception.toString());
  });

  // Login
  await page.goto('/admin/login');
  await page.fill('input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/admin/movies');

  // Wait for movies to load
  await page.waitForTimeout(2000);

  // Get first movie ID and navigate directly
  const firstEditLink = page.locator('a[href*="/admin/movies/"]').first();
  const href = await firstEditLink.getAttribute('href');
  console.log('Edit link href:', href);

  if (href) {
    // Navigate to edit page
    await page.goto(href);

    // Wait for page load
    await page.waitForTimeout(3000);

    // Take screenshot
    await page.screenshot({
      path: 'tests/screenshots/debug-edit-page.png',
      fullPage: true,
    });

    // Log page content
    const title = await page.title();
    const url = page.url();
    const h1Text = await page.locator('h1').textContent();
    const bodyText = await page.locator('body').textContent();

    console.log('Page title:', title);
    console.log('Page URL:', url);
    console.log('H1 text:', h1Text);
    console.log('Body text (first 500 chars):', bodyText?.slice(0, 500));

    // Check for error indicators
    const hasOopsError = await page.locator('text=Oops!').isVisible();
    const hasTypeError = await page.locator('text=TypeError').isVisible();
    const hasEditTitle = await page.locator('text=映画の編集').isVisible();

    console.log('Has Oops error:', hasOopsError);
    console.log('Has TypeError:', hasTypeError);
    console.log('Has edit title:', hasEditTitle);

    // Log console errors
    page.on('console', message => {
      if (message.type() === 'error') {
        console.log('Console error:', message.text());
      }
    });
  }
});
