import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs=[]; p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,200))}); p.on("pageerror",e=>errs.push("PAGEERROR "+e.message.slice(0,200)));
await p.goto("http://localhost:3000/login");
await p.getByRole("textbox",{name:"Email"}).fill("ucan@kenari.com");
await p.getByRole("textbox",{name:"Password"}).fill("AuditSnapy2026!");
await p.getByRole("button",{name:"Masuk",exact:true}).click();
await p.waitForTimeout(4000); console.log("URL after login:", p.url());

// validation
await p.goto("http://localhost:3000/dashboard/packages",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1000);
await p.getByRole("button",{name:"Buka form paket baru"}).click();
await p.waitForTimeout(400);
await p.locator("form").getByRole("button",{name:/Simpan|Tambah|Buat/i}).first().click();
await p.waitForTimeout(1200);
console.log("ALERTS:", JSON.stringify(await p.getByRole("alert").allInnerTexts()));
await p.screenshot({path:"audit-screenshots/after/package-validation.png"});

// support heading
await p.goto("http://localhost:3000/dashboard/support",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(800);
console.log("SUPPORT H2:", await p.locator("h2").allInnerTexts());

// privacy contrast
await p.goto("http://localhost:3000/kebijakan-privasi",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(600);
const link = p.getByRole("link",{name:"hello@snapyos.id"}).first();
console.log("PRIVACY COLOR:", await link.evaluate(el=>getComputedStyle(el).color));
await p.screenshot({path:"audit-screenshots/after/privacy.png"});

// admin duplicate ids
await p.goto("http://localhost:3000/admin/promos",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(800);
const dup = await p.evaluate(()=>{const m={};for(const el of document.querySelectorAll("[id]"))m[el.id]=(m[el.id]||0)+1;return Object.entries(m).filter(([,n])=>n>1);});
console.log("ADMIN DUP IDS:", JSON.stringify(dup));
console.log("ERRORS:", JSON.stringify(errs.slice(0,5)));
await b.close();
