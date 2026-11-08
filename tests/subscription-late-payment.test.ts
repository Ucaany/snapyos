/**
 * P0 #1 — late payment pada invoice `void` (docs/02 §2.4b).
 *
 * Uang settled untuk tagihan yang sudah dibatalkan (void) TIDAK boleh
 * auto-reactivate. Invoice tetap void; sistem mencatat audit
 * `subscription.late_payment_void_invoice` + tiket review manual
 * `subscription_intent_failures` (reason LATE_PAYMENT_VOID_INVOICE) supaya
 * uang dengan entitlement nol tidak hilang diam-diam.
 *
 * Core di `src/lib/subscription-intent-apply.ts` (tanpa server-only) — dipanggil
 * produksi oleh markInvoicePaid (src/server/payment/invoice.ts). Jalankan: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  recordLatePaymentVoidInvoice,
  INTENT_FAILURE_REASON,
  type ApplyIntentDeps,
  type IntentDb,
  type IntentDbError,
} from "../src/lib/subscription-intent-apply.ts";

type AnyRow = Record<string, unknown>;

type Op = {
  kind: "select" | "insert" | "update" | "upsert";
  filters: [string, unknown][];
  patch: AnyRow | null;
  row: AnyRow | null;
  forceError: { message: string; code?: string } | null;
};

class FakeDb {
  failures: AnyRow[] = [];
  private readonly insertError: IntentDbError;

  constructor(insertError: IntentDbError = null) {
    this.insertError = insertError;
  }

  from(table: string) {
    if (table !== "subscription_intent_failures") {
      throw new Error(`FakeDb: tabel tak dikenal ${table}`);
    }
    return new FakeQuery(this);
  }

  execute(op: Op): { data: unknown; error: IntentDbError } {
    if (op.kind === "select") {
      const invoiceId = op.filters.find(([c]) => c === "invoice_id")?.[1];
      const reason = op.filters.find(([c]) => c === "reason")?.[1];
      const status = op.filters.find(([c]) => c === "status")?.[1];
      const found = this.failures.find(
        (f) =>
          (invoiceId === undefined || f.invoice_id === invoiceId) &&
          (reason === undefined || f.reason === reason) &&
          (status === undefined || f.status === status)
      );
      return { data: found ? { id: found.id } : null, error: null };
    }
    if (op.kind === "insert") {
      if (this.insertError) return { data: null, error: this.insertError };
      const row = op.row as AnyRow;
      const dup = this.failures.find(
        (f) => f.invoice_id === row.invoice_id && f.reason === row.reason && f.status === "pending"
      );
      if (dup) return { data: null, error: { message: "duplicate", code: "23505" } };
      this.failures.push({ ...row, id: `failure-${this.failures.length + 1}` });
      return { data: null, error: null };
    }
    if (op.kind === "update") {
      const id = op.filters.find(([c]) => c === "id")?.[1];
      for (const f of this.failures) {
        if (id !== undefined && f.id !== id) continue;
        Object.assign(f, op.patch ?? {});
      }
      return { data: null, error: null };
    }
    throw new Error(`FakeDb: op ${op.kind} tak didukung`);
  }
}

class FakeQuery {
  private op: Op = { kind: "select", filters: [], patch: null, row: null, forceError: null };
  private readonly db: FakeDb;
  constructor(db: FakeDb) {
    this.db = db;
  }
  select() {
    return this;
  }
  insert(row: AnyRow) {
    this.op.kind = "insert";
    this.op.row = row;
    return this;
  }
  update(patch: AnyRow) {
    this.op.kind = "update";
    this.op.patch = patch;
    return this;
  }
  eq(col: string, val: unknown) {
    this.op.filters.push([col, val]);
    return this;
  }
  maybeSingle() {
    return Promise.resolve(this.db.execute(this.op));
  }
  then<T1 = unknown, T2 = never>(
    onf?: ((v: unknown) => T1 | PromiseLike<T1>) | null,
    onr?: ((r: unknown) => T2 | PromiseLike<T2>) | null
  ): Promise<T1 | T2> {
    return Promise.resolve(this.db.execute(this.op)).then(onf, onr);
  }
}

function makeDeps(db: FakeDb) {
  const audits: { action: string; target?: string | null; meta?: AnyRow }[] = [];
  const deps: ApplyIntentDeps = {
    db: db as unknown as IntentDb,
    audit: async (input) => {
      audits.push(input as never);
    },
  };
  return { deps, audits };
}

const VOID_ARGS = {
  businessId: "biz-1",
  invoiceId: "inv-void-1",
  subscriptionId: "sub-1",
  amount: 99000,
  number: "INV-202611-0007",
  intent: {
    items: [
      {
        type: "plan_change" as const,
        plan_id: "plan-starter",
        code: "starter",
        name: "STARTER",
        amount: 99000,
        qty: 1,
      },
    ],
  },
};

test("late payment invoice void: audit + tiket LATE_PAYMENT_VOID_INVOICE, invoice tidak diaktifkan", async () => {
  const db = new FakeDb();
  const { deps, audits } = makeDeps(db);

  await recordLatePaymentVoidInvoice(deps, VOID_ARGS);

  const audit = audits.find((a) => a.action === "subscription.late_payment_void_invoice");
  assert.ok(audit, "audit subscription.late_payment_void_invoice wajib");
  assert.equal(audit!.target, "inv-void-1");
  assert.equal(audit!.meta?.amount, 99000);
  assert.equal(audit!.meta?.subscription_id, "sub-1");

  assert.equal(db.failures.length, 1);
  const ticket = db.failures[0]!;
  assert.equal(ticket.reason, INTENT_FAILURE_REASON.LATE_PAYMENT_VOID_INVOICE);
  assert.equal(ticket.invoice_id, "inv-void-1");
  assert.equal(ticket.business_id, "biz-1");
  assert.equal(ticket.amount, 99000);
  assert.equal(ticket.status, "pending");
  assert.ok(Array.isArray((ticket.intent_snapshot as AnyRow).items));
  assert.equal((ticket.intent_snapshot as AnyRow).applied, undefined);
});

test("late payment retry (reason sama): tiket merge jadi satu baris", async () => {
  const db = new FakeDb();
  const { deps } = makeDeps(db);

  await recordLatePaymentVoidInvoice(deps, VOID_ARGS);
  await recordLatePaymentVoidInvoice(deps, VOID_ARGS);

  assert.equal(db.failures.length, 1, "retry identik tidak menggandakan tiket");
});

test("tiket late-payment gagal ditulis: tidak crash, console.error mencatat invoice", async () => {
  const db = new FakeDb({ message: "db down", code: "XX000" });
  const { deps, audits } = makeDeps(db);

  const logged: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => logged.push(args.map((a) => String(a)).join(" "));
  try {
    await recordLatePaymentVoidInvoice(deps, VOID_ARGS);
  } finally {
    console.error = orig;
  }

  assert.equal(db.failures.length, 0);
  assert.ok(audits.some((a) => a.action === "subscription.late_payment_void_invoice"));
  assert.ok(
    logged.some((l) => l.includes("inv-void-1") && l.includes("LATE_PAYMENT_VOID_INVOICE")),
    "console.error harus mencatat invoice id + reason"
  );
});
