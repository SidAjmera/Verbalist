import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { AnalysisDetail } from '@verbalist/shared-types';
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name, exact: true }).first().click();
}
async function account(page: Page, request: APIRequestContext) {
  const email = `learning-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  await request.post('http://127.0.0.1:54400/auth/v1/signup', {
    data: { email, password: 'fixture-password-123' },
  });
  const response = await request.post('http://127.0.0.1:54400/__test/confirmation', {
    data: { email },
  });
  const { hash } = await response.json();
  await page.goto(`/auth/confirm?token_hash=${hash}&type=signup`);
  await expect(page).toHaveURL(/dashboard/);
  await navigate(page, 'Settings');
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('mock');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/v1/preferences') && r.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Save preferences' }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Save preferences' })).toBeEnabled();
  return email;
}
test('analyzes saved arguments, separates judging/coaching, saves drills and charts only eligible data', async ({
  page,
  request,
}, testInfo) => {
  const email = await account(page, request);
  await navigate(page, 'Debate arena');
  await page.getByRole('button', { name: /replace high-stakes examinations/ }).click();
  await page.getByRole('button', { name: 'Start debate', exact: true }).click();
  await expect(page).toHaveURL(/arena\/[a-f0-9-]+/);
  const debateURL = page.url();
  await page
    .getByLabel('Your argument', { exact: true })
    .fill(
      'Continuous assessment may reward steady learning, provided that schools limit workload and compare grading standards fairly.',
    );
  await page.getByRole('button', { name: 'Submit argument', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze saved turns', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Argument map', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Advisory judge ballot', exact: true }),
  ).not.toBeVisible();
  await page.getByRole('button', { name: 'Generate opponent response', exact: true }).click();
  await expect(
    page.getByText('This review covers an earlier transcript version.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your debate is in the books.' })).toBeVisible();
  const generated = page.waitForResponse(
    (r) => r.url().endsWith('/analysis') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Analyze again', exact: true }).click();
  const analysis = (await (await generated).json()) as AnalysisDetail;
  await expect(
    page.getByRole('heading', { name: 'Advisory judge ballot', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Your coaching plan', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Development simulation · scores excluded from progress', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Research claim', exact: true })).toBeDisabled();
  const map = page.getByRole('region', { name: 'Interactive argument map', exact: true });
  await expect(map.locator('.react-flow__node')).toHaveCount(2);
  await map.locator('.react-flow__node').first().click();
  await page.getByText('Argument list & relationships', { exact: true }).click();
  await page.getByText('Transcript excerpt · Turn 1', { exact: true }).first().click();
  await expect(page.getByRole('blockquote').first()).toContainText('Continuous assessment');
  await page.getByRole('heading', { name: 'Argument map', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('phase3-analysis.png') });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your coaching plan', exact: true }),
  ).toBeVisible();
  await navigate(page, 'Your progress');
  await expect(
    page.getByText('Your first evaluation starts the story.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/development simulation review\(s\) excluded/)).toBeVisible();
  await expect(page.getByText('First case completed', { exact: true })).toBeVisible();
  await page.goto(debateURL);
  await page.getByRole('link', { name: 'Practice this skill', exact: true }).first().click();
  await expect(page).toHaveURL(/practice\?drill=mechanism/);
  await page
    .getByLabel('Your practice response', { exact: true })
    .fill(
      'If travel becomes more affordable, workers can reach a wider job market. This assumes that the service is reliable and connects homes with employers.',
    );
  await page.getByRole('button', { name: 'Get feedback & save', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Practice saved to your account' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Saved practice attempts', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('summary').filter({ hasText: 'Build the mechanism · 3/6' }),
  ).toBeVisible();
  // Test-only seeded evaluator provenance exercises eligible-data charts without a paid AI call.
  // The real production API never falls back to this fixture.
  const tokenResponse = await request.post(
    'http://127.0.0.1:54400/auth/v1/token?grant_type=password',
    { data: { email, password: 'fixture-password-123' } },
  );
  const { access_token } = await tokenResponse.json();
  const nodeKeys = new Map(analysis.arguments.map((a) => [a.id, a.data.key]));
  const ballot = analysis.ballot!;
  const { human_total: _human, ai_total: _ai, winner: _winner, ...rawBallot } = ballot;
  void _human;
  void _ai;
  void _winner;
  const seeded = await request.post('http://127.0.0.1:54400/rest/v1/rpc/save_analysis', {
    headers: { Authorization: `Bearer ${access_token}` },
    data: {
      p_session: analysis.run.session_id,
      p_expected: analysis.run.session_version,
      p_request: crypto.randomUUID(),
      p_provider: 'openai',
      p_model: 'acceptance-fixture',
      p_data: {
        summary: 'Acceptance fixture for chart rendering; not a live provider result.',
        uncertainty: analysis.run.uncertainty,
        arguments: analysis.arguments.map((a) => a.data),
        links: analysis.links.map((l) => ({
          source: nodeKeys.get(l.source_id),
          target: nodeKeys.get(l.target_id),
          relation: l.relation,
          explanation: l.explanation,
          confidence: l.confidence,
        })),
        claims: analysis.claims.map((c) => c.data),
        ballot: rawBallot,
        coach: analysis.coach,
      },
    },
  });
  expect(seeded.ok()).toBeTruthy();
  const seededID = await seeded.json();
  await navigate(page, 'Your progress');
  await expect(page.getByText('60.0/100', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Evaluation score trend/ })).toBeVisible();
  await page.getByRole('combobox', { name: 'Chart metric', exact: true }).selectOption('reasoning');
  await expect(page.getByRole('img', { name: /Evaluation score trend: reasoning/ })).toBeVisible();
  await page.getByText('Score data & model provenance', { exact: true }).click();
  await expect(
    page.getByRole('cell', { name: 'openai/acceptance-fixture', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('phase3-progress.png'), fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('link', { name: 'Open debate', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`review=${seededID}`));
  await expect(
    page.getByRole('button', { name: 'Viewing a saved evaluation · Show latest', exact: true }),
  ).toBeVisible();
  await navigate(page, 'Profile');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my data', exact: true }).click();
  const file = await (await download).path();
  expect(file).not.toBeNull();
  const exported = JSON.parse(await readFile(file!, 'utf8'));
  expect(exported.data.analysis_runs).toHaveLength(3);
  expect(exported.data.drill_attempts).toHaveLength(1);
  expect(exported.data.arguments.length).toBeGreaterThan(0);
  expect(exported.data.judge_ballots).toHaveLength(2);
});
