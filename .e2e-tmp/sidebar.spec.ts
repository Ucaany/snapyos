import { test } from "playwright/test";

const BASE = "http://localhost:4321";

test.describe(() => {
  test.use({ storageState: "/tmp/snapy-e2e/owner-state.json" });
  test("sidebar geometry at 1440", async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const info = await page.evaluate(() => {
      const nav = document.querySelector("nav[aria-label='Navigasi utama']") as HTMLElement;
      const navR = nav.getBoundingClientRect();
      const mobileStrip = nav.querySelector("div.md\\:hidden") as HTMLElement | null;
      const desktopGroups = Array.from(nav.querySelectorAll("div.hidden.md\\:flex")) as HTMLElement[];
      const toggle = document.querySelector('button[aria-label="Ciutkan sidebar"], button[aria-label="Perluas sidebar"]') as HTMLElement | null;
      const collapseCookie = document.cookie;
      const mainCol = document.querySelector("main") as HTMLElement;
      const grid = nav.closest("[style*='--sidebar-w']") as HTMLElement | null;
      return {
        navRect: { x: Math.round(navR.x), w: Math.round(navR.width), h: Math.round(navR.height) },
        mobileStripVisible: mobileStrip ? getComputedStyle(mobileStrip).display : "none",
        desktopGroupCount: desktopGroups.length,
        desktopGroupDisplays: desktopGroups.map((g) => getComputedStyle(g).display),
        toggleLabel: toggle?.getAttribute("aria-label"),
        collapseCookie,
        gridSidebarW: grid?.style.getPropertyValue("--sidebar-w"),
        mainRect: { x: Math.round(mainCol.getBoundingClientRect().x), w: Math.round(mainCol.getBoundingClientRect().width) },
      };
    });
    console.log(JSON.stringify(info, null, 2));
  });
});
