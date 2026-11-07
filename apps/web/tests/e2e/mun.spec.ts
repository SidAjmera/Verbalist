import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('MUN practice pins private briefs, saves drafts, orders delegates and persists a negotiation', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  const email = `mun-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  await request.post('http://127.0.0.1:54400/auth/v1/signup', {
    data: { email, password: 'fixture-password-123' },
  });
  const { hash } = await (
    await request.post('http://127.0.0.1:54400/__test/confirmation', { data: { email } })
  ).json();
  await page.goto(`/auth/confirm?token_hash=${hash}&type=signup`);
  await expect(page).toHaveURL(/dashboard/);
  await page.goto('/settings');
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('mock');
  const settings = page.waitForResponse(
    (r) => r.url().endsWith('/v1/preferences') && r.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Save preferences' }).click();
  expect((await settings).ok()).toBeTruthy();
  await page.goto('/mun');
  await page.getByRole('combobox', { name: 'Committee', exact: true }).selectOption('environment');
  await page
    .getByRole('textbox', { name: 'Agenda', exact: true })
    .fill('Financing locally led flood resilience through transparent grants');
  await page
    .getByLabel('Your practice brief', { exact: true })
    .fill('Hypothetical practice: prioritize transparent funding and measurable local outcomes.');
  await page
    .getByLabel('AI practice brief 1', { exact: true })
    .fill(
      'Hypothetical practice: prioritize affordable implementation and practical technology sharing.',
    );
  await page
    .getByLabel('AI practice brief 2', { exact: true })
    .fill(
      'Hypothetical practice: prioritize local decision making and predictable funding access.',
    );
  await page
    .getByLabel('Your research links', { exact: true })
    .fill('https://ask.un.org/faq/418224');
  await page.getByRole('button', { name: 'Create MUN practice' }).click();
  await expect(page).toHaveURL(/mun\/[a-f0-9-]+/);
  const url = page.url();
  await expect(page.getByText(/Practice briefs and research links are unverified/)).toBeVisible();
  const opening =
    'Predictable funding should support locally chosen priorities, with transparent reporting on access and implementation costs.';
  await page.getByRole('textbox', { name: 'Your contribution', exact: true }).fill(opening);
  await expect(page.getByText('Draft saved', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'All MUN practices' }).click();
  await page.getByRole('link', { name: /Financing locally led flood resilience/ }).click();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole('textbox', { name: 'Your contribution', exact: true })).toHaveValue(
    opening,
  );
  await page.getByRole('button', { name: 'Submit contribution' }).click();
  await page.getByRole('button', { name: 'Ask India to respond' }).click();
  await page.getByRole('button', { name: 'Ask Kenya to respond' }).click();
  await expect(page.locator('ol > li')).toHaveCount(3);
  await expect(page.getByText('Development simulation', { exact: false })).toHaveCount(2);
  const topic = 'Design a transparent process for predictable adaptation grants';
  await page.getByRole('textbox', { name: 'Discussion topic', exact: true }).fill(topic);
  await page.getByRole('combobox', { name: 'Negotiation partner', exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Begin negotiation' }).click();
  await expect(page.getByRole('heading', { name: topic, exact: true })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Your contribution', exact: true })
    .fill(
      'Could predictable grants be combined with locally chosen monitoring committees and transparent reporting?',
    );
  await page.getByRole('button', { name: 'Submit contribution' }).click();
  await page.getByRole('button', { name: 'Ask Kenya to respond' }).click();
  await expect(page.locator('ol > li')).toHaveCount(5);
  await page.getByRole('button', { name: 'Pause practice' }).click();
  await expect(page.getByRole('button', { name: 'Resume practice' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Submit contribution' })).toBeDisabled();
  await page.reload();
  await expect(page.getByText('Practice paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume practice' }).click();
  await expect(page.getByRole('button', { name: 'Pause practice' })).toBeEnabled();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Finish MUN practice' }).click();
  await expect(page.getByRole('heading', { name: 'Practice saved', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('ol > li')).toHaveCount(5);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('phase5-mun.png'), fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  const token = await (
    await request.post('http://127.0.0.1:54400/auth/v1/token?grant_type=password', {
      data: { email: 'bob@example.test', password: 'fixture-password-123' },
    })
  ).json();
  const denied = await request.get('http://127.0.0.1:8100/v1/mun/' + url.split('/').at(-1), {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  expect(denied.status()).toBe(404);
  await page.goto('/profile');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my data' }).click();
  const file = await (await download).path();
  const data = JSON.parse(await readFile(file!, 'utf8'));
  expect(data.data.mun_committees).toHaveLength(1);
  expect(data.data.mun_delegates).toHaveLength(3);
  expect(data.data.mun_messages).toHaveLength(5);
  expect(data.data.mun_drafts).toHaveLength(1);
  expect(data.data.mun_committees[0].status).toBe('completed');
});
