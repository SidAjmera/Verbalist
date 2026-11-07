import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const python =
  process.env.VERBALIST_PYTHON ||
  path.join(
    root,
    'apps/api/.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
const authUrl = 'http://127.0.0.1:54400';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'acceptance.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: 'node tests/fixtures/supabase.mjs',
      cwd: root,
      url: `${authUrl}/health`,
      reuseExistingServer: false,
    },
    {
      command: `"${python}" -m uvicorn verbalist.main:app --host 127.0.0.1 --port 8100 --no-access-log`,
      cwd: path.join(root, 'apps/api'),
      url: 'http://127.0.0.1:8100/health',
      reuseExistingServer: false,
      env: {
        ENVIRONMENT: 'test',
        ENABLE_MOCK_AI: 'true',
        SUPABASE_URL: authUrl,
        SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
        SUPABASE_SECRET_KEY: 'fixture-secret',
        WEB_ORIGINS: '["http://127.0.0.1:3100"]',
      },
    },
    {
      command: 'npm run dev -w @verbalist/web -- --port 3100',
      cwd: root,
      url: 'http://127.0.0.1:3100/login',
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: authUrl,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-public',
        NEXT_PUBLIC_API_URL: 'http://127.0.0.1:8100',
        NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3100',
        NEXT_DIST_DIR: '.next-e2e',
      },
    },
  ],
});
