import { defineConfig } from "playwright/test";
export default defineConfig({ testDir: "/Users/ucaany/Downloads/PT SNAPY OS/.e2e-tmp", testMatch: ["o4-warn.spec.ts"], timeout: 180000, workers: 1,
  use: { headless: false, viewport: { width: 1440, height: 900 }, actionTimeout: 20000 }, reporter: [["list"]] });
