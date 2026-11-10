/**
 * Phase 8 — dashboard tidak lagi mengatur mesin.
 *
 * Yang dikunci di sini hanya janji fase ini: form hanya memuat field cloud,
 * action menolak field milik aplikasi booth, dan tidak ada import tersisa ke
 * berkas yang dihapus.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import {
  CLOUD_PHOTOBOX_FIELDS,
  DASHBOARD_FORBIDDEN_PHOTOBOX_FIELDS,
  forbiddenPhotoboxFields,
} from "../src/lib/photobox-form-fields.ts";

const ROOT = new URL("../", import.meta.url);

async function read(rel: string): Promise<string> {
  return readFile(new URL(rel, ROOT), "utf8");
}

async function walk(rel: string): Promise<string[]> {
  const entries = await readdir(new URL(rel, ROOT), { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && /\.(tsx?|md)$/.test(e.name))
    .map((e) => join(e.parentPath ?? rel, e.name));
}

test("form hanya merender tujuh field cloud", async () => {
  const src = await read("src/components/dashboard/PhotoboxForm.tsx");
  // `id` adalah hidden penanda mode edit, bukan field yang bisa diubah.
  const visible = src.replace(/<input type="hidden" name="id"[^>]*\/>/g, "");
  const rendered = [...visible.matchAll(/name="([a-z_]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(rendered, [...CLOUD_PHOTOBOX_FIELDS].sort());
});

test("form tidak menyebut field teknis mana pun", async () => {
  const src = await read("src/components/dashboard/PhotoboxForm.tsx");
  const leaked = DASHBOARD_FORBIDDEN_PHOTOBOX_FIELDS.filter((field) => src.includes(field));
  assert.deepEqual(leaked, []);
});

test("action dashboard menolak field teknis dari sesi pengguna", async () => {
  const src = await read("src/server/booth-actions.ts");
  // Create dan update sama-sama dijaga sebelum menyentuh data.
  const guards = src.match(/rejectTechnicalFields\(formData\)/g) ?? [];
  assert.equal(guards.length, 2);
  assert.match(
    src,
    /function rejectTechnicalFields[\s\S]*forbiddenPhotoboxFields\(formData\.keys\(\)\)/
  );
});

test("technicalFields menyebut nama field yang dikirim, bukan jumlahnya", () => {
  const rejected = forbiddenPhotoboxFields(["name", "exit_pin", "printer_name", "copies"]);
  assert.deepEqual(rejected, ["exit_pin", "printer_name"]);
  assert.deepEqual(forbiddenPhotoboxFields(["name", "slug", "copies", "print_layout"]), []);
});

test("tidak ada import atau tautan ke berkas yang dihapus", async () => {
  const files = [...(await walk("src")), ...(await walk("docs"))];
  const offenders: string[] = [];
  for (const file of files) {
    const body = await readFile(file, "utf8");
    if (
      /CameraTest|PrinterTestSection|photoboxes\/\[id\]\/camera|getPhotoboxCameraConfig|updatePhotoboxCameraConfig|updatePhotoboxPrintStatus|setPhotoboxMirrorAction|setPhotoboxPreferredCameraAction/.test(
        body
      )
    ) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});

test("PrintTestPanel tetap ada untuk SetupWizard", async () => {
  const panel = await read("src/components/print/PrintTestPanel.tsx");
  assert.match(panel, /export function PrintTestPanel/);
  const wizard = await read("src/components/kiosk/SetupWizard.tsx");
  assert.match(wizard, /from "@\/components\/print\/PrintTestPanel"/);
});
