import { expect, test } from '@playwright/test';

test('app audit page exposes the shared time range picker', async ({ page }) => {
  await page.goto('/app-audit');
  await expect(page.getByRole('button', { name: /last 1 hour/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh charts' })).toBeVisible();
});

test('clickhouse audit history exposes the shared time range picker', async ({ page }) => {
  await page.goto('/ch-audit');
  await page.getByRole('tab', { name: /query history/i }).click();
  await expect(page.getByRole('button', { name: /last 1 hour/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh charts' })).toBeVisible();
});
