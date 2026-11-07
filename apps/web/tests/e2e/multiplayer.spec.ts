import { test, expect, type Page, type APIRequestContext, type Browser } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function account(browser: Browser, request: APIRequestContext, label: string) {
  const email = `room-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  await request.post('http://127.0.0.1:54400/auth/v1/signup', {
    data: { email, password: 'fixture-password-123' },
  });
  const { hash } = await (
    await request.post('http://127.0.0.1:54400/__test/confirmation', { data: { email } })
  ).json();
  const context = await browser.newContext({
    viewport: test.info().project.use.viewport,
    isMobile: test.info().project.use.isMobile,
    hasTouch: test.info().project.use.hasTouch,
    permissions: ['microphone'],
    baseURL: 'http://127.0.0.1:3100',
  });
  await context.addInitScript(() => {
    const Native = window.RTCPeerConnection;
    const peers: RTCPeerConnection[] = [];
    Object.assign(window, { __rtcPeers: peers });
    window.RTCPeerConnection = class extends Native {
      constructor(configuration?: RTCConfiguration) {
        super(configuration);
        peers.push(this);
      }
    };
  });
  context.setDefaultTimeout(15000);
  const page = await context.newPage();
  await page.goto(`/auth/confirm?token_hash=${hash}&type=signup`);
  await expect(page).toHaveURL(/dashboard/);
  return { page, context, email };
}
async function invite(page: Page, role: string) {
  const panel = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Private invitations' }) });
  if (!(await panel.getByLabel('Invitation role').isVisible()))
    await panel.locator('summary').click();
  await panel.getByLabel('Invitation role').selectOption(role);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/invitations') && r.request().method() === 'POST',
  );
  await panel.getByRole('button', { name: 'Create invitation', exact: true }).click();
  expect((await response).ok()).toBeTruthy();
  return panel.getByLabel('New invitation code').inputValue();
}
async function join(page: Page, code: string, alias: string) {
  await page.goto('/rooms');
  await page.getByLabel('Invitation code', { exact: true }).fill(code);
  await page.getByLabel('Your room alias', { exact: true }).last().fill(alias);
  await page.getByLabel(/I agree to share my alias/).check();
  await page.getByRole('button', { name: 'Join with invitation' }).click();
  await expect(page).toHaveURL(/(rooms|tournaments)\/[a-f0-9-]+/);
  if (page.url().includes('/rooms/'))
    await expect(page.getByText('Live updates: connected')).toBeVisible();
}
async function ready(page: Page, rank = false) {
  if (rank) await page.getByLabel(/Consent to practice standings/).check();
  await page.getByRole('button', { name: 'Ready to debate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Withdraw readiness' })).toBeVisible();
}
async function openAudio(page: Page) {
  await page.getByLabel(/I agree to join live audio/).check();
  await page.getByRole('button', { name: /^(Join live audio|Listen to live audio)$/ }).click();
  await expect(page.getByRole('button', { name: 'Leave audio', exact: true })).toBeVisible();
}
async function micEnabled(page: Page) {
  return page.evaluate(() => {
    const peers = (window as unknown as { __rtcPeers: RTCPeerConnection[] }).__rtcPeers;
    return peers
      .flatMap((p) => p.getSenders())
      .some((s) => s.track?.kind === 'audio' && s.track.enabled);
  });
}
test('multiplayer exchanges native WebRTC audio, keeps drafts private and publishes only human-reviewed results', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(180000);
  const judge = await account(browser, request, 'judge'),
    alice = await account(browser, request, 'alice'),
    bob = await account(browser, request, 'bob');
  try {
    for (const [person, handle] of [
      [alice, 'BlueAlice'],
      [bob, 'BlueBob'],
    ] as const) {
      await person.page.goto('/leaderboard');
      await person.page
        .getByLabel('Practice alias', { exact: false })
        .fill(`${handle}_${testInfo.project.name}`);
      await person.page.getByLabel(/Show my alias/).check();
      await person.page.getByRole('button', { name: 'Save ranking preference' }).click();
      await expect(
        person.page.getByRole('button', { name: 'Save ranking preference' }),
      ).toBeEnabled();
    }
    const j = judge.page,
      a = alice.page,
      b = bob.page;
    await j.goto('/settings');
    await j.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('mock');
    const preferences = j.waitForResponse(
      (r) => r.url().endsWith('/v1/preferences') && r.request().method() === 'PATCH',
    );
    await j.getByRole('button', { name: 'Save preferences' }).click();
    expect((await preferences).ok()).toBeTruthy();
    await j.goto('/rooms');
    await j
      .getByLabel('Motion', { exact: true })
      .fill('This house would make local public transport free');
    await j.getByLabel('Your room alias', { exact: true }).first().fill('Independent Judge');
    await j.getByLabel('Your role').selectOption('judge');
    await j.getByLabel('Preparation seconds').fill('0');
    await j.getByRole('button', { name: 'Create room', exact: true }).click();
    await expect(j).toHaveURL(/rooms\/[a-f0-9-]+/);
    const roomURL = j.url();
    await join(a, await invite(j, 'proposition'), 'Alice');
    await join(b, await invite(j, 'opposition'), 'Bob');
    await a
      .getByLabel('Speech text', { exact: true })
      .fill(
        'Cheaper transport widens access to work while reliable funding protects service quality.',
      );
    await expect(a.getByText('Draft saved', { exact: true })).toBeVisible();
    await expect(b.getByLabel('Speech text', { exact: true })).toHaveValue('');
    await expect(
      j.getByText('Cheaper transport widens access', { exact: false }),
    ).not.toBeVisible();
    await openAudio(a);
    await openAudio(b);
    await openAudio(j);
    await expect(a.getByLabel(/Save my next speaking take/)).not.toBeChecked();
    await expect.poll(() => micEnabled(a)).toBe(false);
    await a.getByLabel(/Save my next speaking take/).check();
    await ready(a, true);
    await ready(b, true);
    await expect(j.getByRole('button', { name: 'Start human debate', exact: true })).toBeEnabled();
    await j.getByRole('button', { name: 'Start human debate', exact: true }).click();
    await a.getByRole('button', { name: 'Start proposition speaking clock' }).click();
    await expect.poll(() => micEnabled(a)).toBe(true);
    await expect.poll(() => micEnabled(b)).toBe(false);
    // Browser speech is a fixture; native RTC and microphone streams remain real.
    await a.evaluate(() => {
      class Recognition {
        continuous = true;
        interimResults = true;
        lang = 'en-US';
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror = null;
        onspeechstart = null;
        onspeechend = null;
        onresult:
          ((e: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null =
          null;
        start() {
          this.onstart?.();
        }
        stop() {
          this.onresult?.({
            results: [{ isFinal: true, 0: { transcript: 'Dictated closing words.' } }],
          });
          setTimeout(() => this.onend?.(), 0);
        }
        abort() {
          this.onend?.();
        }
      }
      (window as unknown as { SpeechRecognition: typeof Recognition }).SpeechRecognition =
        Recognition;
    });
    await a.getByLabel(/Allow browser dictation/).check();
    await a.getByRole('button', { name: 'Dictate private draft' }).click();
    await expect(a.getByRole('button', { name: 'Submit shared speech' })).toBeDisabled();
    await a.getByRole('button', { name: 'Stop room dictation' }).click();
    await expect(a.getByRole('textbox', { name: 'Speech text', exact: true })).toHaveValue(
      /Dictated closing words\./,
    );
    await expect(a.getByRole('button', { name: 'Submit shared speech' })).toBeEnabled();
    await expect
      .poll(
        () =>
          b.evaluate(async () => {
            const peers = (window as unknown as { __rtcPeers: RTCPeerConnection[] }).__rtcPeers;
            let bytes = 0;
            for (const peer of peers) {
              const stats = await peer.getStats();
              stats.forEach((s) => {
                if (s.type === 'inbound-rtp' && s.kind === 'audio')
                  bytes += Number(s.bytesReceived || 0);
              });
            }
            return bytes;
          }),
        { timeout: 20000 },
      )
      .toBeGreaterThan(0);
    await a.getByRole('button', { name: 'Submit shared speech' }).click();
    await expect(
      b.getByText(
        'Cheaper transport widens access to work while reliable funding protects service quality. Dictated closing words.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect.poll(() => micEnabled(a)).toBe(false);
    await expect(a.getByRole('link', { name: 'Download my audio' })).toBeVisible();
    const download = a.waitForEvent('download');
    await a.getByRole('link', { name: 'Download my audio' }).click();
    const file = await (await download).path();
    expect((await readFile(file!)).length).toBeGreaterThan(100);
    await a.getByRole('button', { name: 'Discard my audio' }).click();
    await b.getByRole('button', { name: 'Start opposition speaking clock' }).click();
    await b
      .getByLabel('Speech text', { exact: true })
      .fill(
        'Universal subsidies can crowd out targeted improvements and leave unreliable routes unfixed.',
      );
    await b.getByRole('button', { name: 'Submit shared speech' }).click();
    await j
      .getByLabel('Control reason', { exact: true })
      .fill('Both opening cases are complete; finish this practice round.');
    await j.getByRole('button', { name: 'Finish transcript' }).click();
    await expect(j.getByRole('heading', { name: 'Independent judge review' })).toBeVisible();
    await j.getByRole('button', { name: 'Request advisory AI ballot' }).click();
    await expect(j.getByRole('heading', { name: 'Advisory transcript ballot' })).toBeVisible();
    await expect(
      j.getByText(/Development simulation · excluded from AI-assisted rankings/),
    ).toBeVisible();
    await j
      .getByLabel('Written decision')
      .fill(
        'Proposition gave a clearer access mechanism and answered the funding tradeoff in this short practice round.',
      );
    await j.getByLabel(/I independently reviewed/).check();
    await j.getByRole('button', { name: 'Confirm final result' }).click();
    await expect(b.getByRole('heading', { name: 'Proposition wins', exact: true })).toBeVisible();
    await j.evaluate(() => window.scrollTo(0, 0));
    await j.screenshot({ path: testInfo.outputPath('phase4-human-room.png'), fullPage: true });
    await a.goto('/leaderboard');
    await expect(
      a.getByRole('row').filter({ hasText: `BlueAlice_${testInfo.project.name}` }),
    ).toContainText('3');
    await a.goto(roomURL);
    await expect(a.getByRole('heading', { name: 'Proposition wins', exact: true })).toBeVisible();
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await a.goto('/profile');
    const exported = a.waitForEvent('download');
    await a.getByRole('button', { name: 'Export my data' }).click();
    const exportFile = await (await exported).path();
    const data = JSON.parse(await readFile(exportFile!, 'utf8'));
    expect(data.data.room_turns).toHaveLength(2);
    expect(data.data.room_results).toHaveLength(1);
    expect(data.data.room_ballots).toHaveLength(1);
    expect(
      data.data.room_drafts.every(
        (draft: { user_id: string }) =>
          draft.user_id ===
          data.data.room_memberships.find((m: { alias: string }) => m.alias === 'Alice').user_id,
      ),
    ).toBeTruthy();
    expect(data.data.invitations).toBeUndefined();
    expect(data.data.room_signals).toBeUndefined();
  } finally {
    await Promise.all([judge.context.close(), alice.context.close(), bob.context.close()]);
  }
});
test('multiplayer tournament invites, schedules and advances a reviewed two-player final', async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  const judge = await account(browser, request, 'eventjudge'),
    alice = await account(browser, request, 'entrantone'),
    bob = await account(browser, request, 'entranttwo');
  try {
    const j = judge.page,
      a = alice.page,
      b = bob.page;
    await j.goto('/tournaments');
    await j.getByLabel('Tournament title').fill('Blue room cup');
    await j
      .getByLabel('Motion', { exact: true })
      .fill('This house supports investment in public transport');
    await j.getByLabel('Organizer alias').fill('Event judge');
    await j.getByRole('button', { name: 'Create tournament', exact: true }).click();
    await expect(j).toHaveURL(/tournaments\/[a-f0-9-]+/);
    const eventURL = j.url(),
      code = await invite(j, 'entrant');
    await join(a, code, 'First entrant');
    await expect(a).toHaveURL(/tournaments\/[a-f0-9-]+/);
    await join(b, code, 'Second entrant');
    await j.getByRole('button', { name: 'Seed tournament bracket' }).click();
    await expect(j.getByRole('heading', { name: 'Tournament bracket', exact: true })).toBeVisible();
    const scheduled = await j.evaluate(() => {
      const d = new Date(Date.now() + 3600000),
        pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    });
    await j.getByLabel('Round 1 match 1 start time').fill(scheduled);
    const schedule = j.waitForResponse(
      (r) => r.url().endsWith('/actions') && r.request().method() === 'POST',
    );
    await j.getByRole('button', { name: 'Save match schedule' }).click();
    expect((await schedule).ok()).toBeTruthy();
    await expect(j.getByText(/^Scheduled /)).toBeVisible();
    await j.getByLabel('Round 1 match 1 start time').fill('');
    const clear = j.waitForResponse(
      (r) => r.url().endsWith('/actions') && r.request().method() === 'POST',
    );
    await j.getByRole('button', { name: 'Save match schedule' }).click();
    expect((await clear).ok()).toBeTruthy();
    await expect(j.getByText(/^Scheduled /)).not.toBeVisible();
    await j.getByRole('link', { name: 'Open round 1 match 1' }).click();
    await expect(j).toHaveURL(/rooms\/[a-f0-9-]+/);
    const roomURL = j.url();
    await a.goto(roomURL);
    await b.goto(roomURL);
    await ready(a);
    await ready(b);
    await j.getByRole('button', { name: 'Start human debate' }).click();
    a.once('dialog', (d) => d.accept());
    await a.getByLabel('Control reason').fill('I concede after reviewing my available case.');
    await a.getByRole('button', { name: 'Concede debate' }).click();
    await expect(j.getByRole('heading', { name: 'Independent judge review' })).toBeVisible();
    await j.getByLabel('Reviewed outcome').selectOption('opposition');
    await j
      .getByLabel('Written decision')
      .fill('The proposition explicitly conceded; opposition advances under the event rules.');
    await j.getByLabel(/I independently reviewed/).check();
    await j.getByRole('button', { name: 'Confirm final result' }).click();
    await expect(j.getByRole('heading', { name: 'Opposition wins', exact: true })).toBeVisible();
    await j.goto(eventURL);
    await expect(j.getByRole('heading', { name: 'Second entrant', exact: true })).toBeVisible();
    await expect(j.getByText('completed', { exact: true })).toBeVisible();
    await j.screenshot({ path: testInfo.outputPath('phase4-tournament.png'), fullPage: true });
  } finally {
    await Promise.all([judge.context.close(), alice.context.close(), bob.context.close()]);
  }
});
