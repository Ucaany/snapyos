import { defineConfig } from "playwright/test";
export default defineConfig({
  testDir: "/Users/ucaany/Downloads/PT SNAPY OS/.e2e-tmp",
  testMatch: /postab\.spec\.ts/,
  timeout: 60000,
  workers: 1,
  use: { headless: false, viewport: { width: 1440, height: 900 } },
  reporter: [["list"]],
});
