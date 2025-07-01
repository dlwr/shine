import { test, expect } from "@playwright/test";

test.describe("Admin Movie Selections Management", () => {
  const ADMIN_PASSWORD = "*6J6vEVEMkFp8";

  test.beforeEach(async ({ page }) => {
    // Clear localStorage
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test("should display movie selections page with daily, weekly, monthly cards", async ({
    page,
  }) => {
    // Login first
    await page.goto("/admin/login");
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/admin/movies");

    // Navigate to selections page
    await page.goto("/admin/movies/selections");

    // Check page title
    await expect(page.locator("h1")).toContainText("映画選択管理");

    // Check for Back to Movies link
    await expect(page.locator('a[href="/admin/movies"]')).toContainText(
      "← 映画一覧に戻る",
    );

    // Check for three selection cards
    await expect(page.locator('[data-testid="daily-selection"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="weekly-selection"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="monthly-selection"]'),
    ).toBeVisible();

    // Check card headers
    await expect(
      page.locator('[data-testid="daily-selection"] h2'),
    ).toContainText("今日の映画");
    await expect(
      page.locator('[data-testid="weekly-selection"] h2'),
    ).toContainText("今週の映画");
    await expect(
      page.locator('[data-testid="monthly-selection"] h2'),
    ).toContainText("今月の映画");

    // Check for Override Selection buttons
    await expect(
      page.locator('button:has-text("Override Selection")'),
    ).toHaveCount(3);

    // Take screenshot for verification
    await page.screenshot({
      path: "tests/screenshots/admin-selections.png",
      fullPage: true,
    });
  });

  test("should open override modal when Override Selection button is clicked", async ({
    page,
  }) => {
    // Login and navigate to selections
    await page.goto("/admin/login");
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.goto("/admin/movies/selections");

    // Click first Override Selection button
    await page.locator('button:has-text("Override Selection")').first().click();

    // Check modal is visible
    await expect(page.locator('[data-testid="override-modal"]')).toBeVisible();

    // Check modal content
    await expect(
      page.locator('[data-testid="override-modal"] h3'),
    ).toContainText("映画選択をオーバーライド");

    // Check tabs
    await expect(page.locator('[data-testid="search-tab"]')).toContainText(
      "映画を検索",
    );
    await expect(page.locator('[data-testid="random-tab"]')).toContainText(
      "ランダム選択",
    );

    // Check close button works
    await page.locator('button:has-text("キャンセル")').click();
    await expect(
      page.locator('[data-testid="override-modal"]'),
    ).not.toBeVisible();
  });

  test("should perform movie search in override modal", async ({ page }) => {
    // Login and navigate to selections
    await page.goto("/admin/login");
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.goto("/admin/movies/selections");

    // Open override modal
    await page.locator('button:has-text("Override Selection")').first().click();

    // Search for movies
    await page.fill('[data-testid="movie-search-input"]', "PERFECT");

    // Wait for search results
    await page.waitForTimeout(500);

    // Check search results appear
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
  });

  test("should handle random movie selection", async ({ page }) => {
    // Login and navigate to selections
    await page.goto("/admin/login");
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.goto("/admin/movies/selections");

    // Open override modal
    await page.locator('button:has-text("Override Selection")').first().click();

    // Switch to random tab
    await page.locator('[data-testid="random-tab"]').click();

    // Click generate random movie
    await page.locator('button:has-text("ランダム映画を生成")').click();

    // Wait for random movie to appear
    await page.waitForTimeout(1000);

    // Check random movie is displayed
    await expect(
      page.locator('[data-testid="random-movie-result"]'),
    ).toBeVisible();
  });

  test("should handle API errors gracefully", async ({ page }) => {
    // Login and navigate to non-existent selections
    await page.goto("/admin/login");
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    // Navigate to selections page (might fail if API is down)
    await page.goto("/admin/movies/selections");

    // Wait for error handling
    await page.waitForTimeout(2000);

    // Take screenshot for debugging
    await page.screenshot({
      path: "tests/screenshots/admin-selections-error.png",
      fullPage: true,
    });
  });
});
