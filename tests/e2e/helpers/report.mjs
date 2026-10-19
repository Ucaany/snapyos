/**
 * Pencatat hasil spec — semua suite memakai bentuk PASS/FAIL yang sama supaya
 * `run.mjs` bisa merangkum dan exit code 1 bila ada yang gagal.
 */

export function createReporter(name) {
  const results = [];
  const record = (label, ok, detail = "") => {
    results.push({ label, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} — ${label}${detail ? ` :: ${detail}` : ""}`);
  };
  const finish = () => {
    const failed = results.filter((entry) => !entry.ok);
    console.log(`\n[${name}] ${results.length - failed.length}/${results.length} PASS`);
    if (failed.length > 0) {
      for (const entry of failed) console.error(`  FAILED: ${entry.label} ${entry.detail}`);
      process.exitCode = 1;
    }
  };
  return { record, finish, results };
}
