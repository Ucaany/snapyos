import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const octx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const op = await octx.newPage();
await op.goto("http://localhost:3000/login");
await op.getByRole("textbox",{name:"Email"}).fill("ucan@kenari.com");
await op.getByRole("textbox",{name:"Password"}).fill("AuditSnapy2026!");
await op.getByRole("button",{name:"Masuk",exact:true}).click();
await op.waitForURL(u=>!u.pathname.startsWith("/login"),{timeout:20000});
await op.goto("http://localhost:3000/dashboard/photoboxes",{waitUntil:"domcontentloaded"});
await op.waitForTimeout(1500);
await op.getByRole("button",{name:/Perangkat Booth 02/}).click();
await op.waitForTimeout(800);
const reset = op.getByRole("button",{name:"Ulangi setup"});
if (await reset.count()) { await reset.click(); await op.waitForTimeout(1500); }
await op.getByRole("button",{name:"Buat kode"}).click();
await op.waitForTimeout(1500);
const code = (await op.locator("p.font-mono.text-4xl").innerText()).trim();
console.log("CODE", code);
await octx.close();

const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 }, permissions: ["camera"] });
const p = await ctx.newPage();
const errs=[]; p.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,200))}); p.on("pageerror",e=>errs.push("PAGEERROR "+e.message.slice(0,200)));
const dismiss = async () => { const r=p.getByRole("button",{name:"KEMBALI KE KIOSK"}); if(await r.count()&&await r.first().isVisible().catch(()=>false)){await r.first().click().catch(()=>{}); await p.waitForTimeout(600);} };
const dump = async (tag) => {
  await p.waitForTimeout(1200); await dismiss();
  const text = (await p.locator("body").innerText()).replace(/\n+/g," | ").slice(0,1000);
  const btns = await p.locator("button").allInnerTexts();
  console.log(`\n== ${tag} ==\n${text}\nBTN: ${JSON.stringify(btns)}`);
  await p.screenshot({path:`audit-screenshots/before/kiosk-${tag}.png`});
};
await p.goto("http://localhost:3000/p/klik-foto-dev/booth-02",{waitUntil:"domcontentloaded"});
await p.waitForTimeout(1800); await dismiss();
const inp = p.locator("#activation-code"); await inp.click(); await inp.pressSequentially(code,{delay:60});
await p.getByRole("button",{name:"Aktifkan"}).click(); await p.waitForTimeout(2500); await dismiss();
const camNext = p.getByRole("button",{name:/Lanjut ke uji cetak/});
if (await camNext.count()) { await camNext.click(); await p.waitForTimeout(1500); }
const skip = p.getByRole("button",{name:/lewati uji cetak/i});
if (await skip.count()) { await skip.first().click(); await p.waitForTimeout(3500); }
await dump("welcome");
await p.getByRole("button",{name:/^START$/i}).click(); await dump("package-picker");
await p.getByRole("button",{name:/PAKET 02/}).click(); await p.waitForTimeout(6000); await dump("checkout");
const pick = p.getByRole("button",{name:/PILIH PEMBAYARAN/i}).first();
if (await pick.count()) { await pick.click(); await dump("payment-methods"); }
const cash = p.getByRole("button",{name:/BAYAR DI KASIR/i}).first();
if (await cash.count()) { await cash.click(); await p.waitForTimeout(2500); await dump("cash-waiting"); }
// owner confirms cash in parallel
const octx2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
const op2 = await octx2.newPage();
await op2.goto("http://localhost:3000/login");
await op2.getByRole("textbox",{name:"Email"}).fill("ucan@kenari.com");
await op2.getByRole("textbox",{name:"Password"}).fill("AuditSnapy2026!");
await op2.getByRole("button",{name:"Masuk",exact:true}).click();
await op2.waitForURL(u=>!u.pathname.startsWith("/login"),{timeout:20000});
await op2.goto("http://localhost:3000/dashboard",{waitUntil:"domcontentloaded"});
const confirmBtn = op2.getByRole("button",{name:/Konfirmasi bayar/i}).first();
await confirmBtn.waitFor({timeout:15000}).catch(()=>{});
console.log("confirm visible", await confirmBtn.count());
if (await confirmBtn.count()) { await confirmBtn.click(); await op2.waitForTimeout(2000); }
await octx2.close();
await p.waitForTimeout(5000); await dump("after-cash-confirm");
console.log("ERRORS:",errs.slice(0,8));
await b.close();
