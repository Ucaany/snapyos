import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "/Users/ucaany/Downloads/PT SNAPY OS/.e2e-tmp",
  testMatch: ["o4-finance.spec.ts"],
  timeout: 300000,
  workers: 1,
  fullyParallel: false,
  outputDir: "/tmp/snapy-o4/pw-output",
  use: {
    headless: false,
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "off",
    actionTimeout: 20000,
  },
  reporter: [["list"]],
});
