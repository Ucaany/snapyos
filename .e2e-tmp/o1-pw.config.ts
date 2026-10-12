import { defineConfig } from "playwright/test";
export default defineConfig({
  testDir: "/Users/ucaany/Downloads/PT SNAPY OS/.e2e-tmp",
  testMatch: /o1-dashboard\.spec\.ts/,
  timeout: 180000,
  workers: 1,
  fullyParallel: false,
  outputDir: "/tmp/snapy-o1/pw-output",
  use: {
    headless: false,
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    actionTimeout: 15000,
  },
  reporter: [["list"]],
});
