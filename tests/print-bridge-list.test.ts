/**
 * Deteksi printer read-only: parse output `lpstat`/`Get-Printer` dan perilaku
 * klien saat bridge mati. Tanpa hardware dan tanpa proses cetak.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { listCupsPrinters, type PrinterListResult } from "../src/lib/print/cups.ts";
import { parseCupsPrinters, parseWindowsPrinters } from "../runtime/print/index.ts";

const CUPS_OUTPUT = `printer DNP_DS620 is idle.  enabled since Tue 04 Nov 2026 10:00:00 AM WIB
printer Citizen_CY is idle.  enabled since Tue 04 Nov 2026 10:00:00 AM WIB
system default destination: DNP_DS620
`;

const WINDOWS_OUTPUT = `DNP DS620|True
Microsoft Print to PDF|False
`;

test("parse lpstat -p -d: nama unik, default ditandai", () => {
  assert.deepEqual(parseCupsPrinters(CUPS_OUTPUT), [
    { name: "Citizen_CY", default: false },
    { name: "DNP_DS620", default: true },
  ]);
});

test("parse lpstat: default tanpa entri printer tetap muncul", () => {
  assert.deepEqual(parseCupsPrinters("system default destination: OnlyDefault\n"), [
    { name: "OnlyDefault", default: true },
  ]);
});

test("parse lpstat: output kosong = daftar kosong", () => {
  assert.deepEqual(parseCupsPrinters(""), []);
});

test("parse Get-Printer: nama + flag default", () => {
  assert.deepEqual(parseWindowsPrinters(WINDOWS_OUTPUT), [
    { name: "DNP DS620", default: true },
    { name: "Microsoft Print to PDF", default: false },
  ]);
});

test("parse Get-Printer: baris sampah dibuang", () => {
  assert.deepEqual(parseWindowsPrinters("\n  \nno-separator\n"), [
    { name: "no-separator", default: false },
  ]);
});

async function withFetch(stub: () => Promise<Response>, task: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = stub as typeof fetch;
  try {
    await task();
  } finally {
    globalThis.fetch = original;
  }
}

test("klien: bridge mati mengembalikan {ok:false,reason} tanpa throw", async () => {
  await withFetch(
    () => Promise.reject(new TypeError("fetch failed")),
    async () => {
      const result: PrinterListResult = await listCupsPrinters(null);
      assert.equal(result.ok, false);
      assert.match(result.ok === false ? result.reason : "", /tidak aktif/);
    }
  );
});

test("klien: token salah (401) dilaporkan spesifik", async () => {
  await withFetch(
    async () => new Response("{}", { status: 401 }),
    async () => {
      const result = await listCupsPrinters(null);
      assert.equal(result.ok, false);
      assert.match(result.ok === false ? result.reason : "", /Token bridge/);
    }
  );
});

test("klien: respons sukses dinormalisasi", async () => {
  await withFetch(
    async () =>
      new Response(
        JSON.stringify({
          ok: true,
          printers: [{ name: "DNP_DS620", default: true }, { bad: 1 }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
    async () => {
      const result = await listCupsPrinters({ bridge_url: "http://127.0.0.1:1/" });
      assert.deepEqual(result, {
        ok: true,
        printers: [{ name: "DNP_DS620", default: true }],
      });
    }
  );
});
