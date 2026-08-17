import { defineConfig, devices } from '@playwright/test';

/**
 * Durchlauf durch die fertige Anwendung.
 *
 * Läuft gegen den Produktionsbau und damit gegen den echten Routing-Dienst.
 * Deshalb bewusst nicht Teil der CI: brouter.de wird ehrenamtlich betrieben,
 * und ein Testlauf je Push wäre unhöflich. Aufruf: `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:3211',
    locale: 'de-DE',
    trace: 'retain-on-failure',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    command: 'pnpm build && pnpm start --port 3211',
    url: 'http://127.0.0.1:3211/de',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
