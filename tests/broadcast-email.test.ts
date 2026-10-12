import assert from "node:assert/strict";
import { test } from "node:test";

import {
  renderBroadcastHtml,
  renderBroadcastText,
  BROADCAST_KIND_TAGLINE,
} from "../src/lib/broadcast-email.ts";

// ---------- template_key menang atas kind (BUG-5) ----------
test("template_key eksplisit mengalahkan kind saat render", () => {
  const html = renderBroadcastHtml({
    subject: "Uji",
    body: "Isi",
    recipientName: "Andi",
    kind: "announcement",
    templateKey: "promo",
  });
  // Accent promo (#ff5c5c) & tagline promo harus muncul, bukan announcement.
  assert.match(html, /#ff5c5c/i);
  assert.ok(html.includes(BROADCAST_KIND_TAGLINE.promo));
  assert.ok(!html.includes(BROADCAST_KIND_TAGLINE.announcement));
});

test("template_key 'default' jatuh ke kind", () => {
  const html = renderBroadcastHtml({
    subject: "Uji",
    body: "Isi",
    recipientName: "Andi",
    kind: "event",
    templateKey: "default",
  });
  assert.match(html, /#34d399/i);
  assert.ok(html.includes(BROADCAST_KIND_TAGLINE.event));
});

// ---------- recipient name asli, bukan email (BUG-4) ----------
test("recipientName dirender apa adanya (nama), bukan fallback email", () => {
  const html = renderBroadcastHtml({
    subject: "Uji",
    body: "Isi",
    recipientName: "Budi Santoso",
    kind: "system",
  });
  assert.ok(html.includes("Budi Santoso"));
});

test("renderBroadcastText memakai template_key juga", () => {
  const text = renderBroadcastText({
    subject: "Uji",
    body: "Isi",
    kind: "announcement",
    templateKey: "newsletter",
  });
  assert.ok(text.includes(BROADCAST_KIND_TAGLINE.newsletter));
});

// ---------- escaping tetap aman ----------
test("body & subject di-escape (anti XSS)", () => {
  const html = renderBroadcastHtml({
    subject: "<script>alert(1)</script>",
    body: "<img src=x onerror=alert(1)>",
    recipientName: "A",
    kind: "system",
  });
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;script&gt;"));
});
