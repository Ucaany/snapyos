/**
 * Settlement RPC correctness tests — 0040 gateway enum fix.
 *
 * These tests parse the actual SQL migration and schema.sql to verify:
 *   1. settle_paid_payment_atomically no longer writes 'gateway'.
 *   2. The CHECK constraint on transactions.payment_method does NOT include 'gateway'.
 *   3. All payment_method values the RPC can produce are in the CHECK allow-list.
 *   4. The function signature matches what settlement.ts expects.
 *   5. Idempotency patterns (ON CONFLICT DO NOTHING) are preserved.
 *   6. FOR UPDATE lock ordering is preserved.
 *   7. Balance ledger logic is present (not dropped like in settle_qris_payment).
 *   8. settle_qris_payment is DROPped in 0040.
 *   9. create_voucher_payment_atomically is unchanged and in schema baseline.
 *  10. The return columns match the app code cast.
 *
 * node:test — no database required (SQL static analysis).
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (rel: string) => readFile(new URL(rel, root), "utf8");

// ---------------------------------------------------------------------------
// Load sources once
// ---------------------------------------------------------------------------

let migration0040: string;
let migration0031: string;
let migration0036: string;
let migration0059: string;
let schema: string;
let settlementTs: string;

test("load SQL and TS sources", async () => {
  [migration0040, migration0031, migration0036, migration0059, schema, settlementTs] =
    await Promise.all([
      read("db/migrations/0040_fix_settle_payment_gateway_enum.sql"),
      read("db/migrations/0031_payment_settlement_atomicity.sql"),
      read("db/migrations/0036_drop_gateway_payment_method.sql"),
      read("db/migrations/0059_payment_settlement_hardening.sql"),
      read("db/schema.sql"),
      read("src/server/payment/settlement.ts"),
    ]);
});

// ---------------------------------------------------------------------------
// 1. settle_paid_payment_atomically must NOT write 'gateway'
// ---------------------------------------------------------------------------

test("0040: settle_paid_payment_atomically body does not contain 'gateway' literal", () => {
  // Extract PL/pgSQL body between $$ delimiters (this is what PostgreSQL stores)
  const fnMatch = migration0040.match(
    /create or replace function settle_paid_payment_atomically\b[\s\S]*?\$\$([\s\S]*?)\$\$/i
  );
  assert.ok(fnMatch, "settle_paid_payment_atomically not found in 0040 migration");
  const body = fnMatch[1];
  assert.ok(body, "Function body capture group missing");
  // 'gateway' must not appear as a string literal in the function body
  const stringLiterals = body.match(/'gateway'/gi);
  assert.equal(stringLiterals, null, "Function body still contains 'gateway' string literal");
});

test("schema.sql: settle_paid_payment_atomically body does not contain 'gateway' literal", () => {
  const fnMatch = schema.match(
    /create or replace function settle_paid_payment_atomically\b[\s\S]*?\$\$;/i
  );
  assert.ok(fnMatch, "settle_paid_payment_atomically not found in schema.sql");
  const body = fnMatch[0];
  const stringLiterals = body.match(/'gateway'/gi);
  assert.equal(
    stringLiterals,
    null,
    "schema.sql function body still contains 'gateway' string literal"
  );
});

// ---------------------------------------------------------------------------
// 2. CHECK constraint does NOT include 'gateway'
// ---------------------------------------------------------------------------

test("schema.sql: transactions.payment_method CHECK excludes 'gateway'", () => {
  // Target the transactions table specifically (not pos_transactions which has a different CHECK).
  // The schema has a multi-line definition with comments between default and check.
  const txSection = schema.match(/create\s+table\s+transactions\s*\([\s\S]*?\);/i);
  assert.ok(txSection, "transactions table definition not found in schema.sql");
  const checkMatch = txSection[0].match(/check\s*\(\s*payment_method\s+in\s*\(([^)]+)\)\s*\)/i);
  assert.ok(checkMatch, "payment_method CHECK constraint not found in transactions table");
  const allowed = checkMatch[1];
  assert.ok(allowed, "payment_method CHECK values capture group missing");
  assert.ok(!allowed.includes("gateway"), `CHECK still contains 'gateway': ${allowed}`);
});

// ---------------------------------------------------------------------------
// 3. RPC payment_method values are all in CHECK allow-list
// ---------------------------------------------------------------------------

test("RPC payment_method output values are subset of CHECK allow-list", () => {
  // Extract CHECK values from the transactions table (not pos_transactions)
  const txSection = schema.match(/create\s+table\s+transactions\s*\([\s\S]*?\);/i);
  assert.ok(txSection, "transactions table definition not found in schema.sql");
  const txBody = txSection[0];
  assert.ok(txBody, "transactions table body missing");
  const checkMatch = txBody.match(/check\s*\(\s*payment_method\s+in\s*\(([^)]+)\)\s*\)/i);
  assert.ok(checkMatch, "payment_method CHECK constraint not found in transactions table");
  const checkValues = checkMatch[1];
  assert.ok(checkValues, "payment_method CHECK values capture group missing");
  const allowed = new Set((checkValues.match(/'([^']+)'/g) ?? []).map((s) => s.replace(/'/g, "")));

  // Extract CASE expression from 0040 function
  const fnMatch = migration0040.match(
    /create or replace function settle_paid_payment_atomically\b[\s\S]*?\$\$;/i
  );
  assert.ok(fnMatch, "settle_paid_payment_atomically not found in 0040 migration");
  const fnBody = fnMatch[0];
  assert.ok(fnBody, "Function body missing");
  // The CASE outputs: 'cash' and 'qris'
  const caseMatch = fnBody.match(
    /case\s+when\s+v_payment\.provider\s*=\s*'cash'\s+then\s+'cash'\s+else\s+'qris'\s+end/i
  );
  assert.ok(caseMatch, "Expected two-way CASE (cash/qris) not found in function body");
  for (const val of ["cash", "qris"]) {
    assert.ok(allowed.has(val), `'${val}' not in CHECK allow-list: ${[...allowed].join(", ")}`);
  }
});

// ---------------------------------------------------------------------------
// 4. Function signature matches app code expectations
// ---------------------------------------------------------------------------

test("0040: return signature matches settlement.ts cast", () => {
  // settlement.ts casts to: { transaction_number: string; result_token: string; settled_now: boolean }
  const fnHeader = migration0040.match(/returns\s+table\s*\(([^)]+)\)/i);
  assert.ok(fnHeader, "RETURNS TABLE not found in 0040 migration");
  const colsRaw = fnHeader[1];
  assert.ok(colsRaw, "RETURNS TABLE columns capture group missing");
  const cols = colsRaw.toLowerCase();
  assert.ok(cols.includes("transaction_number"), "Missing return column transaction_number");
  assert.ok(cols.includes("result_token"), "Missing return column result_token");
  assert.ok(cols.includes("settled_now"), "Missing return column settled_now");
});

test("schema.sql: settle_paid_payment_atomically return signature matches settlement.ts", () => {
  const fnHeader = schema.match(
    /function settle_paid_payment_atomically[\s\S]*?returns\s+table\s*\(([^)]+)\)/i
  );
  assert.ok(fnHeader, "settle_paid_payment_atomically RETURNS TABLE not found in schema.sql");
  const colsRaw = fnHeader[1];
  assert.ok(colsRaw, "RETURNS TABLE columns capture group missing");
  const cols = colsRaw.toLowerCase();
  assert.ok(cols.includes("transaction_number"), "Missing return column transaction_number");
  assert.ok(cols.includes("result_token"), "Missing return column result_token");
  assert.ok(cols.includes("settled_now"), "Missing return column settled_now");
});

test("settlement.ts calls settle_paid_payment_atomically (not settle_qris_payment)", () => {
  assert.ok(
    settlementTs.includes("settle_paid_payment_atomically"),
    "settlement.ts should call settle_paid_payment_atomically"
  );
  assert.ok(
    !settlementTs.includes("settle_qris_payment"),
    "settlement.ts should NOT reference settle_qris_payment"
  );
});

// ---------------------------------------------------------------------------
// 5. Idempotency — ON CONFLICT DO NOTHING preserved
// ---------------------------------------------------------------------------

test("0040: idempotency ON CONFLICT DO NOTHING patterns preserved", () => {
  const fnBody = migration0040.match(
    /create or replace function settle_paid_payment_atomically\b[\s\S]*?\$\$;/i
  )![0];
  const onConflictCount = (fnBody.match(/on\s+conflict\b[^;]*\bdo\s+nothing/gi) ?? []).length;
  // voucher_usages is the single ON CONFLICT DO NOTHING (balance ledger dropped
  // in 0044 — withdrawal flow removed).
  assert.ok(
    onConflictCount >= 1,
    `Expected at least 1 ON CONFLICT DO NOTHING, got ${onConflictCount}`
  );
});

// ---------------------------------------------------------------------------
// 6. FOR UPDATE lock ordering preserved
// ---------------------------------------------------------------------------

test("0040: FOR UPDATE on payments then checkout_sessions", () => {
  const fnBody = migration0040.match(
    /create or replace function settle_paid_payment_atomically\b[\s\S]*?\$\$;/i
  )![0];
  const paymentLock = fnBody.indexOf("from payments where id = p_payment_id for update");
  const checkoutLock = fnBody.indexOf(
    "from checkout_sessions where id = v_payment.checkout_session_id for update"
  );
  assert.ok(paymentLock > -1, "Missing FOR UPDATE on payments");
  assert.ok(checkoutLock > -1, "Missing FOR UPDATE on checkout_sessions");
  assert.ok(
    paymentLock < checkoutLock,
    "Lock order: payments must be locked before checkout_sessions"
  );
});

// ---------------------------------------------------------------------------
// 7. Balance ledger logic removed (withdrawal flow dropped, 0044)
// ---------------------------------------------------------------------------

test("0044: settle_paid_payment_atomically no longer credits balance/ledger", () => {
  const fnBody = schema.match(
    /create or replace function settle_paid_payment_atomically\b[\s\S]*?\$\$;/i
  )![0];
  assert.ok(
    !fnBody.includes("balance_ledger"),
    "settle_paid_payment_atomically should no longer write balance_ledger"
  );
  assert.ok(
    !fnBody.includes("insert into balances"),
    "settle_paid_payment_atomically should no longer credit balances"
  );
  assert.ok(
    !fnBody.includes("platform_fee"),
    "settle_paid_payment_atomically should no longer write platform_fee receivable"
  );
});

test("0036 settle_qris_payment LACKS balance ledger (confirming it was incomplete)", () => {
  const fnBody = migration0036.match(
    /create or replace function settle_qris_payment\b[\s\S]*?\$\$;/i
  )![0];
  assert.ok(
    !fnBody.includes("balance_ledger"),
    "settle_qris_payment unexpectedly has balance_ledger — verify this assumption"
  );
  assert.ok(
    !fnBody.includes("platform_fee"),
    "settle_qris_payment unexpectedly has platform_fee — verify this assumption"
  );
});

// ---------------------------------------------------------------------------
// 8. settle_qris_payment is DROPped
// ---------------------------------------------------------------------------

test("0040: drops settle_qris_payment", () => {
  assert.ok(
    migration0040.match(/drop\s+function\s+(if\s+exists\s+)?settle_qris_payment/i),
    "0040 should DROP settle_qris_payment"
  );
});

test("schema.sql: settle_qris_payment does not exist", () => {
  assert.ok(
    !schema.includes("settle_qris_payment"),
    "schema.sql should not contain settle_qris_payment after fix"
  );
});

// ---------------------------------------------------------------------------
// 9. create_voucher_payment_atomically present in schema baseline
// ---------------------------------------------------------------------------

test("schema.sql: create_voucher_payment_atomically present", () => {
  assert.ok(
    schema.match(/create or replace function create_voucher_payment_atomically/i),
    "create_voucher_payment_atomically should be in schema.sql baseline"
  );
});

test("schema.sql: create_voucher_payment_atomically writes 'voucher' not 'gateway'", () => {
  const fnBody = schema.match(
    /create or replace function create_voucher_payment_atomically\b[\s\S]*?\$\$;/i
  )![0];
  assert.ok(
    !fnBody.includes("'gateway'"),
    "create_voucher_payment_atomically should not write 'gateway'"
  );
  assert.ok(
    fnBody.includes("'voucher'"),
    "create_voucher_payment_atomically should write 'voucher' as payment_method"
  );
});

// ---------------------------------------------------------------------------
// 10. GRANT/REVOKE in schema.sql
// ---------------------------------------------------------------------------

test("schema.sql: GRANT service_role on both RPC functions", () => {
  assert.ok(
    schema.match(/grant\s+execute\s+on\s+function\s+settle_paid_payment_atomically/i),
    "Missing GRANT for settle_paid_payment_atomically"
  );
  assert.ok(
    schema.match(/grant\s+execute\s+on\s+function\s+create_voucher_payment_atomically/i),
    "Missing GRANT for create_voucher_payment_atomically"
  );
});

// ---------------------------------------------------------------------------
// 11. 0031 original bug confirmation (regression anchor)
// ---------------------------------------------------------------------------

test("0031 original: confirms 'gateway' literal was present (regression anchor)", () => {
  const fnBody = migration0031.match(
    /create or replace function settle_paid_payment_atomically\b[\s\S]*?\$\$;/i
  )![0];
  assert.ok(
    fnBody.includes("'gateway'"),
    "0031 should contain the original buggy 'gateway' literal (test anchor)"
  );
});

// ---------------------------------------------------------------------------
// 12. Direct-merchant path: credential_id IS NOT NULL → 'qris' (not 'gateway')
// ---------------------------------------------------------------------------

test("0040: direct-merchant (credential_id not null) settles as 'qris'", () => {
  const fnBody = migration0040.match(
    /create or replace function settle_paid_payment_atomically\b[\s\S]*?\$\$;/i
  )![0];
  // The CASE is simply: cash → 'cash', else → 'qris'
  // There must NOT be a branch for credential_id in the payment_method CASE
  const caseExpr = fnBody.match(/case\s+when[\s\S]*?end/i)![0];
  assert.ok(
    !caseExpr.includes("credential_id"),
    "payment_method CASE should not branch on credential_id — direct-merchant gets 'qris'"
  );
  assert.ok(!caseExpr.includes("'gateway'"), "payment_method CASE must not produce 'gateway'");
});

// ---------------------------------------------------------------------------
// 13. Pakasir aggregator (credential_id NULL) → 'qris'
// ---------------------------------------------------------------------------

test("0040: Pakasir aggregator (non-cash, no credential) settles as 'qris'", () => {
  const fnBody = migration0040.match(
    /create or replace function settle_paid_payment_atomically\b[\s\S]*?\$\$;/i
  )![0];
  // The else branch of the CASE is 'qris' — covers both credential_id null and not null
  const caseExpr = fnBody.match(
    /case\s+when\s+v_payment\.provider\s*=\s*'cash'\s+then\s+'cash'\s+else\s+'qris'\s+end/i
  );
  assert.ok(caseExpr, "Expected: CASE WHEN provider='cash' THEN 'cash' ELSE 'qris' END");
});

// ---------------------------------------------------------------------------
// 14. Post-check assertion in migration
// ---------------------------------------------------------------------------

test("0040: migration has post-check assertion", () => {
  assert.ok(
    migration0040.match(/pg_get_functiondef/i),
    "Migration should verify function body via pg_get_functiondef"
  );
  assert.ok(
    migration0040.match(/settle_qris_payment.*still exists/i),
    "Migration should verify settle_qris_payment is gone"
  );
});

// ---------------------------------------------------------------------------
// 15. Schema baseline consistency: 0040 function body = schema.sql body
// ---------------------------------------------------------------------------

test("0059 migration function body matches schema.sql baseline (latest settlement RPC)", () => {
  const extractBody = (src: string, name: string) => {
    const match = src.match(
      new RegExp(`create or replace function ${name}\\b[\\s\\S]*?\\$\\$;`, "i")
    );
    if (!match) return null;
    // Normalize whitespace for comparison
    return match[0].replace(/\s+/g, " ").trim();
  };
  const migBody = extractBody(migration0059, "settle_paid_payment_atomically");
  const schemaBody = extractBody(schema, "settle_paid_payment_atomically");
  assert.ok(migBody, "Function not found in 0059 migration");
  assert.ok(schemaBody, "Function not found in schema.sql");
  assert.equal(migBody, schemaBody, "0059 migration and schema.sql function bodies must match");
});
