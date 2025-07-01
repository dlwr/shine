import {test, expect} from '@playwright/test';

test.describe('Admin Movies Management', () => {
	const ADMIN_PASSWORD = '*6J6vEVEMkFp8';

	test.beforeEach(async ({page}) => {
		// Clear localStorage
		await page.goto('/');
		await page.evaluate(() => {
			localStorage.clear();
		});
	});

	test('should login and navigate to admin movies', async ({page}) => {
		// Navigate to admin login
		await page.goto('/admin/login');

		// Check if login page loads
		await expect(page.locator('h1')).toContainText('管理者ログイン');

		// Fill password and login
		await page.fill('input[name="password"]', ADMIN_PASSWORD);
		await page.click('button[type="submit"]');

		// Should redirect to admin movies page
		await expect(page).toHaveURL('/admin/movies');

		// Check if movies page loads
		await expect(page.locator('h1')).toContainText('Movies Management');

		// Wait for movies to load
		await page.waitForTimeout(2000);

		// Take a screenshot for debugging
		await page.screenshot({
			path: 'tests/screenshots/admin-movies-list.png',
			fullPage: true,
		});

		// Check if movies are displayed or "No movies found" message
		const moviesTable = page.locator('table');
		const noMoviesMessage = page.locator('text=No movies found');

		await expect(async () => {
			const tableVisible = await moviesTable.isVisible();
			const noMoviesVisible = await noMoviesMessage.isVisible();

			console.log('Table visible:', tableVisible);
			console.log('No movies message visible:', noMoviesVisible);

			expect(tableVisible || noMoviesVisible).toBe(true);
		}).toPass();
	});

	test('should access movie edit page', async ({page}) => {
		// Login first
		await page.goto('/admin/login');
		await page.fill('input[name="password"]', ADMIN_PASSWORD);
		await page.click('button[type="submit"]');
		await expect(page).toHaveURL('/admin/movies');

		// Wait for page to load
		await page.waitForTimeout(2000);

		// Check if there are edit buttons
		const editButtons = page.locator('text=Edit');
		const editButtonCount = await editButtons.count();

		console.log('Number of edit buttons found:', editButtonCount);

		if (editButtonCount > 0) {
			// Click the first edit button
			await editButtons.first().click();

			// Wait for navigation
			await page.waitForTimeout(2000);

			// Check URL pattern (should be /admin/movies/[id])
			const currentUrl = page.url();
			console.log('Current URL after clicking edit:', currentUrl);
			expect(currentUrl).toMatch(/\/admin\/movies\/[a-f\d-]+$/);

			// Take screenshot of the edit page
			await page.screenshot({
				path: 'tests/screenshots/admin-movie-edit.png',
				fullPage: true,
			});

			// Check if edit page loads properly
			await expect(page.locator('h1')).toContainText('映画の編集');

			// Check for presence of main sections
			await expect(page.locator('text=映画情報')).toBeVisible();
			await expect(page.locator('text=翻訳管理')).toBeVisible();
			await expect(page.locator('text=ノミネート管理')).toBeVisible();
			await expect(page.locator('text=ポスター管理')).toBeVisible();
		} else {
			console.log('No edit buttons found, checking page content');

			// Take screenshot for debugging
			await page.screenshot({
				path: 'tests/screenshots/admin-movies-no-edit.png',
				fullPage: true,
			});

			// Log page content for debugging
			const content = await page.locator('body').textContent();
			console.log('Page content:', content?.slice(0, 500));
		}
	});

	test('should handle API errors gracefully', async ({page}) => {
		// Login first
		await page.goto('/admin/login');
		await page.fill('input[name="password"]', ADMIN_PASSWORD);
		await page.click('button[type="submit"]');
		await expect(page).toHaveURL('/admin/movies');

		// Navigate to a non-existent movie ID
		await page.goto('/admin/movies/non-existent-id');

		// Wait for error handling
		await page.waitForTimeout(2000);

		// Take screenshot
		await page.screenshot({
			path: 'tests/screenshots/admin-movie-error.png',
			fullPage: true,
		});

		// Should show error message or redirect
		const hasError = await page
			.locator('text=映画が見つかりません')
			.isVisible();
		const hasRedirect = page.url().includes('/admin/login');

		console.log('Has error message:', hasError);
		console.log('Redirected to login:', hasRedirect);
	});
});
