/**
 * Loader uji — supaya modul server app bisa diimpor dari `node --test`.
 *
 * Dua hal yang menghalangi impor langsung:
 *  1. Alias `@/*` hanya dipahami TypeScript/Next (tsconfig `paths`), bukan Node.
 *  2. `server-only` melempar kecuali di-resolve dengan kondisi `react-server`.
 *
 * Selain itu, `@/lib/supabase/server` dialihkan ke stub yang membaca
 * `globalThis.__SB_STUB` — jadi tes bisa menyuntik klien palsu tanpa jaringan.
 *
 * Dipakai lewat `module.register()` di dalam berkas tes (bukan lewat flag CLI),
 * agar tes lain yang tidak butuh tidak terpengaruh.
 */

import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

/** Akar repo = dua level di atas `tests/helpers/`. */
const ROOT = path.resolve(import.meta.dirname, "..", "..");
const SRC = path.join(ROOT, "src");

/** Modul kosong pengganti `server-only`. */
const EMPTY = `data:text/javascript,export default {};`;

/** Stub supabase — delegasi ke global agar bisa diatur per-tes. */
const SB_STUB = pathToFileURL(
  path.join(import.meta.dirname, "supabase-stub.mjs")
).href;

/** Stub Next/Auth.js — request context tidak ada di `node --test`. */
const NEXT_STUBS = pathToFileURL(
  path.join(import.meta.dirname, "next-stubs.mjs")
).href;

/** Stub `next-auth` — modul aslinya menarik `next/server` (lihat berkasnya). */
const NEXTAUTH_STUB = pathToFileURL(
  path.join(import.meta.dirname, "nextauth-stub.mjs")
).href;

/**
 * Selesaikan `@/x` ke berkas nyata di `src/`, mencoba ekstensi yang lazim.
 * `@/lib/supabase/server` dipaksa ke stub (bukan modul aslinya).
 */
function resolveAlias(specifier) {
  const rel = specifier.slice(2); // buang "@/"
  if (rel === "lib/supabase/server") return SB_STUB;
  const base = path.join(SRC, rel);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && !candidate.endsWith(path.sep)) {
      // Direktori lolos existsSync — hanya terima berkas.
      try {
        if (path.extname(candidate)) return pathToFileURL(candidate).href;
      } catch {
        /* jatuh ke kandidat berikutnya */
      }
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: EMPTY, shortCircuit: true, format: "module" };
  }
  // Modul Next/Auth.js hanya hidup di runtime Next; di tes diganti stub.
  if (specifier === "next/headers") {
    return { url: NEXT_STUBS, shortCircuit: true };
  }
  if (specifier === "next-auth") {
    return { url: NEXTAUTH_STUB, shortCircuit: true };
  }
  if (specifier === "@/lib/auth") {
    return { url: NEXT_STUBS, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const url = resolveAlias(specifier);
    if (url) return { url, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
