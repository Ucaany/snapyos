/**
 * Kontrak widget Turnstile yang mahal bila rusak:
 * - hanya Cloudflare yang boleh menulis `cf-turnstile-response` (satu nilai);
 * - kegagalan challenge harus sampai ke UI, bukan didiamkan.
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("widget Turnstile tidak menambah hidden input duplikat", async () => {
  const widget = await readFile(new URL("src/components/turnstile-widget.tsx", root), "utf8");
  const auth = await readFile(new URL("src/components/auth-block.tsx", root), "utf8");
  const photobox = await readFile(
    new URL("src/components/dashboard/PhotoboxForm.tsx", root),
    "utf8"
  );

  assert.doesNotMatch(widget, /<input[^>]*name="cf-turnstile-response"/);
  assert.doesNotMatch(auth, /<input[^>]*name="cf-turnstile-response"/);
  assert.doesNotMatch(photobox, /<input[^>]*name="cf-turnstile-response"/);
});

test("kegagalan Turnstile memunculkan status error dan aksi retry", async () => {
  const widget = await readFile(new URL("src/components/turnstile-widget.tsx", root), "utf8");
  const auth = await readFile(new URL("src/components/auth-block.tsx", root), "utf8");
  const photobox = await readFile(
    new URL("src/components/dashboard/PhotoboxForm.tsx", root),
    "utf8"
  );

  assert.match(widget, /"error-callback":\s*\(\)\s*=>\s*\{[\s\S]*?setStatus\("error"\)/);
  assert.match(auth, /captchaFailed/);
  assert.match(auth, /role="alert"/);
  assert.match(auth, /Coba verifikasi lagi/);
  assert.match(photobox, /captchaFailed/);
  assert.match(photobox, /role="alert"/);
  assert.match(photobox, /Coba verifikasi lagi/);
});

test("server action mempertahankan nama token CAPTCHA saat normalisasi FormData", async () => {
  const actions = await readFile(new URL("src/server/booth-actions.ts", root), "utf8");

  assert.match(actions, /key\.startsWith\("cf-"\)\s*\?\s*key\s*:/);
});
