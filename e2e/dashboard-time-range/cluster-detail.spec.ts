import { expect, test, type Page } from '@playwright/test';

const clusterId = process.env.E2E_CLUSTER_ID;

async function openClusterDetail(page: Page) {
  if (clusterId) {
    await page.goto(`/cluster/${clusterId}`);
    return;
  }

  await page.goto('/');
  const firstClusterLink = page.locator('a[href^="/cluster/"]').first();
  await expect(firstClusterLink).toBeVisible();
  const href = await firstClusterLink.getAttribute('href');
  expect(href).toBeTruthy();
  await page.goto(String(href));
}

test('cluster detail shared time range updates timeseries requests', async ({ page }) => {
  const requests = [] as string[];

  await page.route('**/api/clusters/*/metrics/timeseries**', async (route) => {
    requests.push(route.request().url());
    await route.continue();
  });

  await openClusterDetail(page);
  await page.getByText('All Nodes - Overview').scrollIntoViewIfNeeded();
  await expect.poll(() => requests.length > 0).toBeTruthy();
  await page.waitForTimeout(1500);
  const requestsBeforeBlur = requests.length;
  const backgroundPage = await page.context().newPage();
  await backgroundPage.goto('about:blank');
  await backgroundPage.bringToFront();
  await page.waitForTimeout(500);
  await page.bringToFront();
  await page.waitForTimeout(1000);
  expect(requests.length).toBe(requestsBeforeBlur);
  await backgroundPage.close();

  await page.getByRole('button', { name: 'Last 1 hour' }).click();
  await page.getByRole('button', { name: 'Last 15 mins' }).click();

  await expect.poll(() => requests.some((url) => url.includes('preset=last-15m'))).toBeTruthy();
  await page.waitForTimeout(1000);

  await page.locator('button[aria-haspopup="dialog"]').filter({ hasText: 'Last 15 mins' }).first().click();
  await expect(page.locator('input[type="datetime-local"]').first()).toBeVisible();
  const dateInputs = page.locator('input[type="datetime-local"]');
  await dateInputs.nth(0).fill('2026-03-31T09:00');
  await dateInputs.nth(1).fill('2026-03-31T10:00');
  await page.locator('button').filter({ hasText: 'Apply' }).last().click({ force: true });

  await expect.poll(() => requests.some((url) => url.includes('mode=absolute') && url.includes('from=2026-03-31T09%3A00'))).toBeTruthy();

  const requestsBeforeRefresh = requests.length;
  await page.getByRole('button', { name: 'Refresh charts' }).click();
  await expect.poll(() => requests.length > requestsBeforeRefresh).toBeTruthy();
  await expect.poll(() => requests.some((url) => url.includes('refresh='))).toBeTruthy();
});

test('cluster detail redistributes ETC diagnostics into domain tabs', async ({ page }) => {
  await openClusterDetail(page);

  await expect(page.getByRole('tab', { name: 'ETC' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Connection & Keeper' })).toBeVisible();
  await expect(page.getByText('Queries').first()).toBeVisible();
  await expect(page.getByText('Storage').first()).toBeVisible();
  await expect(page.getByText('Operations').first()).toBeVisible();
  await expect(page.getByText('Conn&Keeper').first()).toBeVisible();
  await expect(page.getByText('All Nodes - Overview')).toBeVisible();
  await expect(page.getByText('Current Query Memory').first()).toBeVisible();
  await expect(page.getByText('Distribution Queue').first()).toBeVisible();
  await expect(page.getByText('HTTP Connections').first()).toBeVisible();
  await expect(page.getByText('TCP Connections').first()).toBeVisible();
  await expect(page.getByText('Parts Count').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Queries' }).click();
  await expect(page.getByRole('heading', { name: /Failed Queries/ }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Node / User / Client Query Distribution').first()).toBeVisible({ timeout: 15000 });
  const queryTypeBox = await page.getByText('Query Type Distribution').first().boundingBox();
  const failedQueriesBox = await page.getByRole('heading', { name: /Failed Queries/ }).first().boundingBox();
  expect(queryTypeBox).not.toBeNull();
  expect(failedQueriesBox).not.toBeNull();
  expect((failedQueriesBox?.y ?? 0) >= (queryTypeBox?.y ?? 0)).toBeTruthy();

  await page.getByRole('tab', { name: 'Storage' }).click();
  await expect(page.getByText('Parts Status by Node').first()).toBeVisible();
  await expect(page.getByText('Database Disk Usage by Node').first()).toBeVisible();
  await expect(page.getByText('File Descriptors').first()).toBeVisible();
  await expect(page.getByText('Background Pool').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Operations' }).click();
  await expect(page.getByRole('heading', { name: /Replication Queue by Table/ }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: /Distribution Queue by Table/ }).first()).toBeVisible({ timeout: 15000 });

  await page.getByRole('tab', { name: 'Connection & Keeper' }).click();
  await expect(page.getByText('Network I/O').first()).toBeVisible();
});

test('cluster detail preserves selected tab on page refresh', async ({ page }) => {
  await openClusterDetail(page);

  await page.getByRole('tab', { name: 'Operations' }).click();
  await expect(page.getByRole('heading', { name: /Replication Queue by Table/ }).first()).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveURL(/tab=operations/);

  await page.reload();

  await expect(page.getByRole('tab', { name: 'Operations', selected: true })).toBeVisible();
  await expect(page).toHaveURL(/tab=operations/);
});
