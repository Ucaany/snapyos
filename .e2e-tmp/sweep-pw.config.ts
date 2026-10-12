import { defineConfig } from "playwright/test";
export default defineConfig({
  testDir: "/Users/ucaany/Downloads/PT SNAPY OS/.e2e-tmp",
  testMatch: /sweep\.spec\.ts/,
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  use: { headless: false, viewport: { width: 1440, height: 900 }, screenshot: "only-on-failure" },
  reporter: [["list"]],
});
