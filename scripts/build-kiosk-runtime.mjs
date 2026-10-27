#!/usr/bin/env node
/**
 * Siapkan runtime lokal untuk dibungkus EXE kiosk (Phase 9).
 *
 * Hasil: `src-tauri/runtime-dist/main.mjs` + modul native yang tidak bisa
 * dibundel (`@node-rs/argon2`). Dijalankan sebagai `beforeBuildCommand` Tauri,
 * dan di Windows saja — build EXE tidak mungkin dari macOS.
 *
 * Kenapa dibundel: `runtime/` mengimpor `../../src/lib/*.ts` dan memakai
 * `--experimental-strip-types`. Node yang dibundel sebagai sidecar harus
 * menjalankan satu berkas tanpa flag eksperimental, dan tipe TypeScript tidak
 * boleh ikut ke produksi.
 */

import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src-tauri", "runtime-dist");
const outFile = path.join(outDir, "main.mjs");

// Modul native: esbuild hanya bisa menandainya external, jadi paketnya
// disalin apa adanya ke sebelah bundle.
const NATIVE_PACKAGES = ["@node-rs/argon2"];

async function platformPackages() {
  // Paket binary @node-rs/argon2 dipilih npm lewat optionalDependencies
  // sesuai platform build. Nama mengikuti napi-rs: `win32-x64-msvc`,
  // `darwin-arm64`, `linux-x64-gnu`.
  const triple =
    process.platform === "win32"
      ? `win32-${process.arch}-msvc`
      : process.platform === "darwin"
        ? `darwin-${process.arch}`
        : `linux-${process.arch}-gnu`;
  return [`@node-rs/argon2-${triple}`];
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [path.join(root, "runtime", "main.ts")],
  outfile: outFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // `node:sqlite` dan modul native tidak boleh dibundel.
  external: ["node:*", ...NATIVE_PACKAGES],
  banner: {
    // pdfkit membaca font AFM relatif ke modul; beri `require` untuk CJS
    // di dalam bundle ESM.
    js: "import { createRequire as __snapyosCreateRequire } from 'node:module'; const require = __snapyosCreateRequire(import.meta.url);",
  },
  logLevel: "info",
});

for (const name of [...NATIVE_PACKAGES, ...(await platformPackages())]) {
  const from = path.join(root, "node_modules", name);
  try {
    await cp(from, path.join(outDir, "node_modules", name), { recursive: true });
  } catch (error) {
    // Paket platform yang tidak cocok dengan mesin build memang tidak ada;
    // yang wajib hanya paket yang di-resolve untuk platform ini.
    if (name.startsWith("@node-rs/argon2-")) {
      console.warn(`[kiosk-runtime] lewati ${name}: ${error.message}`);
      continue;
    }
    throw error;
  }
}

await writeFile(
  path.join(outDir, "package.json"),
  JSON.stringify(
    {
      name: "snapyos-kiosk-runtime",
      private: true,
      type: "module",
      // pdfkit memanggil `require("#standard-fonts/Helvetica")` saat mencetak.
      // Subpath `#...` hanya bisa di-resolve lewat `imports` milik package.json
      // terdekat, dan bundle ini berada di luar folder paket pdfkit. Tanpa peta
      // ini setiap cetak gagal "Cannot find module '#standard-fonts/...'".
      imports: { "#standard-fonts/*": "./standard-fonts/*.cjs" },
    },
    null,
    2
  ) + "\n"
);

await cp(
  path.join(root, "node_modules", "pdfkit", "js", "standard-fonts"),
  path.join(outDir, "standard-fonts"),
  { recursive: true }
);

console.log(`[kiosk-runtime] siap: ${path.relative(root, outFile)}`);
