import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
async function navigate(page: Page, label: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name: label, exact: true }).first().click();
}
async function account(page: Page, request: APIRequestContext) {
  const email = `voice-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  await request.post('http://127.0.0.1:54400/auth/v1/signup', {
    data: { email, password: 'fixture-password-123' },
  });
  const confirmation = await request.post('http://127.0.0.1:54400/__test/confirmation', {
    data: { email },
  });
  const { hash } = await confirmation.json();
  await page.goto(`/auth/confirm?token_hash=${hash}&type=signup`);
  await expect(page).toHaveURL(/dashboard/);
  await navigate(page, 'Settings');
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('mock');
  await page.getByRole('combobox', { name: 'Preferred input', exact: true }).selectOption('voice');
  await page.getByRole('combobox', { name: 'Preferred output', exact: true }).selectOption('both');
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/v1/preferences') && response.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Save preferences' }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Save preferences' })).toBeEnabled();
  await navigate(page, 'Debate arena');
  await page.getByRole('button', { name: /replace high-stakes examinations/ }).click();
  await page
    .getByRole('combobox', { name: 'Preparation allowance', exact: true })
    .selectOption('0');
  await page.getByRole('combobox', { name: 'Speaking allowance', exact: true }).selectOption('60');
  await page.getByRole('checkbox', { name: /Use synchronized practice clocks/ }).check();
  await page.getByRole('button', { name: 'Start debate', exact: true }).click();
  await expect(page).toHaveURL(/arena\/[a-f0-9-]+/);
}
async function speech(page: Page, denied = false) {
  await page.addInitScript(
    ({ denied }) => {
      const state = {
        recorders: 0,
        tracksStopped: 0,
        denied,
        recognition: null as Recognition | null,
      };
      class Recognition {
        continuous = false;
        interimResults = false;
        lang = '';
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onresult: ((event: unknown) => void) | null = null;
        start() {
          state.recognition = this;
          this.onstart?.();
        }
        stop() {
          this.onresult?.({
            results: [
              {
                isFinal: true,
                0: { transcript: 'Dictated argument for fair and consistent assessment.' },
              },
            ],
          });
          this.onend?.();
        }
        abort() {
          this.onend?.();
        }
      }
      class Recorder {
        static isTypeSupported() {
          return true;
        }
        state = 'inactive';
        mimeType = 'audio/webm';
        ondataavailable: ((event: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        constructor() {
          state.recorders++;
        }
        start() {
          this.state = 'recording';
        }
        stop() {
          this.state = 'inactive';
          this.ondataavailable?.({
            data: new Blob(['fixture audio bytes'], { type: 'audio/webm' }),
          });
          this.onstop?.();
        }
      }
      Object.defineProperty(window, 'SpeechRecognition', {
        configurable: true,
        value: Recognition,
      });
      Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder });
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            if (state.denied) throw new DOMException('denied', 'NotAllowedError');
            const track = {
              stop() {
                state.tracksStopped++;
              },
              onended: null,
            };
            return { getTracks: () => [track], getAudioTracks: () => [track] };
          },
        },
      });
      class Utterance {
        constructor(public text: string) {}
      }
      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        configurable: true,
        value: Utterance,
      });
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: {
          getVoices: () => [],
          addEventListener() {},
          removeEventListener() {},
          speak() {},
          cancel() {},
          pause() {},
          resume() {},
        },
      });
      Object.defineProperty(window, '__speechFixture', { value: state });
    },
    { denied },
  );
}
test('optional audio stays local, clocks recover, and streamed responses support playback', async ({
  page,
  request,
}, testInfo) => {
  await speech(page);
  await account(page, request);
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('radio', { name: 'Don’t save audio', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Start microphone' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Allow browser speech processing/ }).check();
  await page.getByRole('button', { name: 'Start speaking time', exact: true }).click();
  await page.getByRole('button', { name: 'Start microphone' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Microphone active' })).toBeVisible();
  await page.evaluate(() => {
    const fixture = (
      window as unknown as {
        __speechFixture: { recognition: { onresult: (event: unknown) => void } };
      }
    ).__speechFixture;
    fixture.recognition.onresult({
      results: [{ isFinal: false, 0: { transcript: 'thinking aloud' } }],
    });
  });
  await expect(page.getByText('thinking aloud', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Stop microphone' }).click();
  await expect(page.getByLabel('Your argument', { exact: true })).toHaveValue(
    'Dictated argument for fair and consistent assessment.',
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __speechFixture: { recorders: number } }).__speechFixture.recorders,
    ),
  ).toBe(0);
  await expect(page.getByText('Your optional recording', { exact: true })).not.toBeVisible();
  await page.getByRole('radio', { name: 'Record for download', exact: true }).check();
  await page.getByRole('button', { name: 'Start microphone' }).click();
  await page.getByRole('button', { name: 'Stop microphone' }).click();
  await expect(page.getByText('Your optional recording', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __speechFixture: { recorders: number } }).__speechFixture.recorders,
    ),
  ).toBe(1);
  const arena = page.url();
  await navigate(page, 'Settings');
  await expect(page).toHaveURL(arena);
  await expect(
    page.getByText('Save or discard your optional audio before leaving.', { exact: false }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Save audio to device' }).click();
  expect((await download).suggestedFilename()).toMatch(/^verbalist-.*\.webm$/);
  await page.getByRole('button', { name: 'Discard audio' }).click();
  await expect(page.getByText('Your optional recording', { exact: true })).not.toBeVisible();
  await page.context().setOffline(true);
  await expect(
    page.getByRole('status').filter({ hasText: 'Offline — keep this page open' }),
  ).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByText('Live account sync connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const frozen = await page.getByRole('timer').textContent();
  await page.reload();
  await expect(page.getByRole('timer')).toHaveText(frozen!);
  await page.getByRole('button', { name: 'Resume debate', exact: true }).click();
  await page.getByRole('button', { name: 'Submit argument', exact: true }).click();
  await page.getByRole('button', { name: 'Generate opponent response', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Opponent speaking' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause audio', exact: true }).click();
  await expect(page.getByText('Speech paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume audio', exact: true }).click();
  await page.getByRole('button', { name: 'Stop audio', exact: true }).click();
  await expect(page.getByText('[DEVELOPMENT SIMULATION', { exact: false }).first()).toBeVisible();
  const other = await page.context().newPage();
  await other.goto(arena);
  await other
    .getByLabel('Your argument', { exact: true })
    .fill('Synchronized transcript from another tab.');
  await expect(other.getByRole('status').filter({ hasText: 'Saved to account' })).toBeVisible();
  await expect(page.getByLabel('Your argument', { exact: true })).toHaveValue(
    'Synchronized transcript from another tab.',
  );
  await other.close();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('phase2-voice.png'), fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});
test('denied microphone access preserves an editable text path', async ({ page, request }) => {
  await speech(page, true);
  await account(page, request);
  await page.getByRole('checkbox', { name: /Allow browser speech processing/ }).check();
  await page.getByRole('button', { name: 'Start speaking time', exact: true }).click();
  await page.getByRole('button', { name: 'Start microphone' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Microphone permission was denied' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Use text instead', exact: true }).click();
  await page
    .getByLabel('Your argument', { exact: true })
    .fill('A typed argument works when microphone access is denied.');
  await page.getByRole('button', { name: 'Submit argument', exact: true }).click();
  await page.getByRole('button', { name: 'Use standard response', exact: true }).click();
  await expect(page.getByText('[DEVELOPMENT SIMULATION', { exact: false }).first()).toBeVisible();
});
