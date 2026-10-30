import { expect, test } from '@playwright/test';

test('user statistics time range picker is visible', async ({ page }) => {
  await page.goto('/stats');
  await expect(page.getByRole('button', { name: /last 1 hour/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh charts' })).toBeVisible();
});
