import { test, expect } from '@playwright/test';

test('dashboard loads (mock mode)', async ({ page }) => {
  await page.goto('/');

  // GlobalHeader renders the page title as a plain <span>, not a heading
  // element, so it isn't exposed via the "heading" accessibility role.
  await expect(page.getByText('Dashboard Overview', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Monitor all your CH clusters in one place').first()).toBeVisible();
});

test('settings page loads', async ({ page }) => {
  await page.goto('/settings');

  await expect(page.getByText('Settings', { exact: true }).first()).toBeVisible();
});
