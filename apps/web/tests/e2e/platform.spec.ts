import { test, expect, type Page } from '@playwright/test';
async function login(page: Page, email = 'alice@example.test') {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('fixture-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole('heading', { name: 'Recent debates' })).toBeVisible();
}
async function navigate(page: Page, label: string) {
  if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('link', { name: label, exact: true }).first().click();
}
test('protects platform routes and renders responsive sign-in', async ({ page }) => {
  for (const route of [
    '/dashboard',
    '/arena',
    '/history',
    '/progress',
    '/practice',
    '/settings',
    '/profile',
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/login/);
  }
  await expect(page.getByRole('heading', { name: 'Welcome to Verbalist' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});
test('registers, verifies through a simulated link and deletes the private account', async ({
  page,
  request,
}) => {
  const email = `new-${Date.now()}@example.test`;
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('fixture-password-123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Verify your email');
  const fixture = await request.post('http://127.0.0.1:54400/__test/confirmation', {
    data: { email },
  });
  const { hash } = await fixture.json();
  await page.goto(`/auth/confirm?token_hash=${hash}&type=signup`);
  await expect(page).toHaveURL(/dashboard/);
  await navigate(page, 'Profile');
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Permanently delete account' }).click();
  await expect(page).toHaveURL(/login/);
});
test('completes debate, restores cross-device drafts, isolates data and exports', async ({
  page,
  browser,
}, testInfo) => {
  await login(page);
  await page.screenshot({ path: testInfo.outputPath('dashboard.png') });
  await navigate(page, 'Settings');
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('mock');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByRole('combobox', { name: 'Provider', exact: true })).toHaveValue('mock');
  await navigate(page, 'Debate arena');
  await page.getByRole('button', { name: /replace high-stakes examinations/ }).click();
  await page.getByRole('button', { name: 'Start debate', exact: true }).click();
  await expect(page).toHaveURL(/arena\/[a-f0-9-]+/);
  const debateUrl = page.url();
  await page
    .getByLabel('Your argument', { exact: true })
    .fill('My opening draft: assessment should reward steady learning.');
  // Navigate immediately while the debounce may still be pending. The editor must
  // save before changing routes and mobile navigation must dismiss its overlay.
  await navigate(page, 'Settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.goto(debateUrl);
  await expect(page.getByRole('status').filter({ hasText: 'Saved to account' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Your argument', { exact: true })).toHaveValue(
    'My opening draft: assessment should reward steady learning.',
  );
  const second = await browser.newContext();
  const device = await second.newPage();
  await login(device);
  await device.goto(debateUrl);
  await expect(device.getByLabel('Your argument', { exact: true })).toHaveValue(
    'My opening draft: assessment should reward steady learning.',
  );
  await second.close();
  for (let round = 0; round < 3; round++) {
    await page
      .getByLabel('Your argument', { exact: true })
      .fill(
        `My argument in round ${round + 1}: continuous assessment rewards consistency, but safeguards should protect students from bias.`,
      );
    await page.getByRole('button', { name: 'Submit argument', exact: true }).click();
    await page.getByRole('button', { name: 'Generate opponent response', exact: true }).click();
    if (round < 2) await expect(page.getByLabel('Your argument', { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Your debate is in the books.' })).toBeVisible();
  await expect(page.getByText('[DEVELOPMENT SIMULATION', { exact: false }).first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('completed-debate.png') });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  const outsider = await browser.newContext();
  const outsiderPage = await outsider.newPage();
  await login(outsiderPage, 'bob@example.test');
  await outsiderPage.goto(debateUrl);
  await expect(
    outsiderPage.getByRole('alert').filter({ hasText: 'Debate not found' }),
  ).toBeVisible();
  await outsider.close();
  await navigate(page, 'Debate history');
  await page
    .getByRole('link', { name: /replace high-stakes examinations/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Your debate is in the books.' })).toBeVisible();
  await navigate(page, 'Profile');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my data' }).click();
  expect((await download).suggestedFilename()).toBe('verbalist-data.json');
});
test('holds BYOK in memory and clears it on reload', async ({ page }, testInfo) => {
  await login(page);
  await navigate(page, 'Settings');
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('openai');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await page.getByLabel('Your API key', { exact: true }).fill('fixture-ephemeral-key');
  await page.getByRole('button', { name: 'Use for this session' }).click();
  await expect(page.getByText('Set for this session', { exact: true })).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
      cookies: document.cookie,
    }),
  );
  expect(stored).not.toContain('fixture-ephemeral-key');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: testInfo.outputPath('dark-settings.png') });
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.reload();
  await expect(page.getByText('No key held', { exact: true })).toBeVisible();
});
