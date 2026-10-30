import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type FullConfig } from '@playwright/test';
import { prisma } from '../src/lib/prisma';
import { createSession } from '../src/lib/auth/session-store';

const E2E_USER_EMAIL = 'e2e@example.com';

// Sessions are looked up in Postgres by hashed token (see session-store.ts),
// so a fabricated cookie value with no matching DB row is indistinguishable
// from an invalid one — getSessionUser() returns null and every protected
// page redirects to /login. A real Session row (via createSession(), the
// same function every login path uses) is the only way to produce a cookie
// the app will actually treat as authenticated.
async function buildAuthCookie(baseURL: string) {
  const url = new URL(baseURL);
  const domain = url.hostname;

  const user = await prisma.user.upsert({
    where: { email: E2E_USER_EMAIL },
    update: {},
    create: {
      email: E2E_USER_EMAIL,
      name: 'E2E User',
      role: 'admin',
      password: null,
    },
  });

  const { token, expiresAt } = await createSession(user.id, {
    ipAddress: '127.0.0.1',
    userAgent: 'playwright',
  });

  return {
    name: 'app_session',
    value: token,
    domain,
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax' as const,
    expires: Math.floor(expiresAt.getTime() / 1000),
  };
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL as string | undefined;
  if (!baseURL) {
    throw new Error('Playwright baseURL is not configured');
  }

  await mkdir('./e2e/.auth', { recursive: true });

  const cookie = await buildAuthCookie(baseURL);
  await prisma.$disconnect();

  const browser = await chromium.launch();
  const context = await browser.newContext();

  await context.addCookies([cookie]);

  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });

  const storageState = await context.storageState();
  await writeFile('./e2e/.auth/storageState.json', JSON.stringify(storageState, null, 2), 'utf-8');

  await browser.close();
}
