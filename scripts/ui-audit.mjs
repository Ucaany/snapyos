// UI/UX audit crawler — Playwright DOM measurements (no visual judgement).
// Usage: node scripts/ui-audit.mjs [--base http://localhost:3000]
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:3000";
const OUT = "audit-screenshots";
// Kredensial audit TIDAK boleh hardcoded: repo ini publik, jadi literal di sini
// = kebocoran kredensial (temuan M5 run-1, CWE-798). Isi lewat env:
//   AUDIT_PASSWORD='...' node scripts/ui-audit.mjs
const PASSWORD = process.env.AUDIT_PASSWORD ?? "";
if (!PASSWORD) {
  throw new Error("AUDIT_PASSWORD belum diset (jangan menaruh password di source).");
}

const ROLES = {
  owner: { email: "ucan@kenari.com", routes: [
    "/dashboard", "/dashboard/analytics", "/dashboard/metrics", "/dashboard/photoboxes",
    "/dashboard/branding", "/dashboard/devices", "/dashboard/outlets", "/dashboard/templates",
    "/dashboard/packages", "/dashboard/vouchers", "/dashboard/pos", "/dashboard/transactions",
    "/dashboard/finance", "/dashboard/payment", "/dashboard/reports", "/dashboard/customers",
    "/dashboard/staff", "/dashboard/subscription", "/dashboard/settings", "/dashboard/support",
  ]},
  admin: { email: "ucan@snapyos.id", routes: [
    "/admin", "/admin/businesses", "/admin/users", "/admin/subscriptions",
    "/admin/subscriptions/pending-review", "/admin/payments", "/admin/plans", "/admin/add-ons",
    "/admin/promos", "/admin/gateways", "/admin/templates", "/admin/broadcasts",
    "/admin/audit", "/admin/support", "/admin/settings",
  ]},
  staff: { email: "staf@kenari.com", routes: [
    "/staff", "/staff/outlets", "/staff/packages", "/staff/photoboxes", "/staff/templates",
  ]},
  public: { email: null, routes: [
    "/", "/docs", "/docs/perangkat", "/kamera", "/kontak", "/subscribe", "/tentang-kami",
    "/kebijakan-privasi", "/ketentuan-layanan", "/kebijakan-refund", "/login",
    "/forgot-password", "/register", "/welcome", "/onboarding/create-business",
    "/p/klik-foto-dev/booth-01", "/pos", "/pos/terminal",
  ]},
};

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const CHECK = () => {
  const vw = window.innerWidth;
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const label = (el) => {
    const t = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ");
    return t.slice(0, 60) || el.tagName.toLowerCase();
  };
  const path = (el) => {
    const parts = [];
    let n = el;
    for (let i = 0; i < 4 && n && n.nodeType === 1; i++) {
      let p = n.tagName.toLowerCase();
      if (n.id) p += "#" + n.id;
      else if (n.className && typeof n.className === "string") p += "." + n.className.split(/\s+/).slice(0, 2).join(".");
      parts.unshift(p);
      n = n.parentElement;
    }
    return parts.join(" > ");
  };

  const overflow = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      const s = getComputedStyle(el);
      if (s.position === "fixed") continue;
      overflow.push({ el: path(el), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
      if (overflow.length >= 12) break;
    }
  }

  const smallTargets = [];
  for (const el of document.querySelectorAll("a[href],button,input,select,textarea,[role=button],[role=tab],[role=switch]")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) {
      smallTargets.push({ el: path(el), label: label(el), w: Math.round(r.width), h: Math.round(r.height) });
      if (smallTargets.length >= 25) break;
    }
  }

  const imgsNoAlt = [...document.images].filter((i) => visible(i) && !i.hasAttribute("alt")).map((i) => i.currentSrc || i.src).slice(0, 10);

  const unnamed = [];
  for (const el of document.querySelectorAll("button,a[href],input,select,textarea")) {
    if (!visible(el)) continue;
    const name = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
    const labelled = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (!name && !labelled && !el.getAttribute("aria-labelledby")) {
      unnamed.push({ el: path(el), tag: el.tagName.toLowerCase(), type: el.getAttribute("type") });
      if (unnamed.length >= 15) break;
    }
  }

  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible).map((h) => Number(h.tagName[1]));
  const headingSkips = [];
  for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) headingSkips.push(`${headings[i - 1]}→${headings[i]}`);

  const ids = {};
  for (const el of document.querySelectorAll("[id]")) ids[el.id] = (ids[el.id] || 0) + 1;
  const dupIds = Object.entries(ids).filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`).slice(0, 10);

  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.5) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 253, b: 245, a: 1 };
  };
  const contrast = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("p,span,a,button,label,li,td,th,h1,h2,h3,h4,h5,h6,small,strong,em,div")) {
    if (!visible(el)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(s.fontSize);
    const bold = Number(s.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const min = large ? 3 : 4.5;
    if (ratio < min) {
      const key = `${s.color}|${s.backgroundColor}|${Math.round(size)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      contrast.push({ el: path(el), text: label(el), ratio: Math.round(ratio * 100) / 100, min, size: Math.round(size), color: s.color, bg: `rgb(${bg.r},${bg.g},${bg.b})` });
      if (contrast.length >= 15) break;
    }
  }

  return {
    title: document.title,
    url: location.pathname,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: vw,
    horizontalOverflow: document.documentElement.scrollWidth > vw + 1,
    overflow,
    smallTargets,
    imgsNoAlt,
    unnamed,
    headingSkips,
    dupIds,
    contrast,
    h1Count: document.querySelectorAll("h1").length,
    bodyText: (document.body.innerText || "").slice(0, 200),
  };
};

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
}

const results = [];
const browser = await chromium.launch();
await mkdir(`${OUT}/before`, { recursive: true });

for (const [role, cfg] of Object.entries(ROLES)) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + e.message.slice(0, 200)));
  if (cfg.email) await login(page, cfg.email);

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const route of cfg.routes) {
      const before = consoleErrors.length;
      let status = 0;
      try {
        const res = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
        status = res?.status() ?? 0;
        await page.waitForTimeout(1200);
        const data = await page.evaluate(CHECK);
        const slug = route === "/" ? "landing" : route.replace(/^\//, "").replace(/[\/\[\]]+/g, "-");
        await page.screenshot({ path: `${OUT}/before/${role}-${vp.name}-${slug}.png`, fullPage: false });
        results.push({ role, viewport: vp.name, route, status, ...data, consoleErrors: consoleErrors.slice(before) });
      } catch (e) {
        results.push({ role, viewport: vp.name, route, status, error: String(e).slice(0, 300) });
      }
    }
  }
  await context.close();
}

await browser.close();
await writeFile(`${OUT}/audit-results.json`, JSON.stringify(results, null, 2));
const summary = results.map((r) => ({
  role: r.role, vp: r.viewport, route: r.route, status: r.status,
  overflow: r.horizontalOverflow ? "YES" : "",
  small: r.smallTargets?.length ?? 0,
  contrast: r.contrast?.length ?? 0,
  unnamed: r.unnamed?.length ?? 0,
  noalt: r.imgsNoAlt?.length ?? 0,
  h1: r.h1Count,
  err: r.error ? "ERR" : "",
}));
console.table(summary);
console.log(`\n${results.length} pages audited → ${OUT}/audit-results.json`);
