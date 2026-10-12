import { defineConfig } from "playwright/test";
export default defineConfig({
  testDir: "/Users/ucaany/Downloads/PT SNAPY OS/.e2e-tmp",
  testMatch: /o1b\.spec\.ts/,
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  use: { headless: false, viewport: { width: 1440, height: 900 } },
  reporter: [["list"]],
});
