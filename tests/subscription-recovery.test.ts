/**
 * Self-service expired recovery (docs/02 §2.4) — owner expired membayar
 * invoice baru → subscription aktif kembali dengan periode BARU dari now()
 * (BUKAN extend dari current_period_end lama yang sudah mati).
 *
 * Jalur yang diuji (core, tanpa server-only):
 *   createSubscriptionInvoice (expired diterima, plan_change dipaksa) —
 *     logika keputusan di-subset sebagai pure helper di bawah; jalur
 *     server-nya identik: isRecovery → isActualPlanChange=true.
 *   applyInvoiceIntentWithDeps (expired diterima di SELECT/UPDATE,
 *     periode dari now() saat reactivasi plan sama).
 *
 * Past due dalam grace TIDAK boleh kena jalur recovery — periode tetap
 * extend dari period_end. Cancelled tetap gagal (SUBSCRIPTION_NOT_ACTIVE).
 * Jalankan: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyInvoiceIntentWithDeps,
  INTENT_FAILURE_REASON,
  type ApplyIntentDeps,
  type IntentDb,
  type IntentDbError,
} from "../src/lib/subscription-intent-apply.ts";
import { PERIOD_DAYS } from "../src/lib/subscription-math.ts";

// ---------------------------------------------------------------------------
// In-memory fake Supabase (subset: invoices, subscriptions, failures)
// ---------------------------------------------------------------------------

type AnyRow = Record<string, unknown>;

type Op = {
  kind: "select" | "update" | "insert" | "upsert";
  filters: [string, unknown][];
  ins: [string, unknown[]][];
  orCond: string | null;
  patch: AnyRow | null;
  row: AnyRow | null;
  upsertOpts: AnyRow | null;
};

type InvoiceRow = {
  id: string;
  business_id: string;
  subscription_id: string | null;
  amount: number;
  status: string;
  intent: AnyRow | null;
};

type SubRow = {
  id: string;
  plan_id: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

class FakeDb {
  invoices = new Map<string, InvoiceRow>();
  subscriptions = new Map<string, SubRow>();
  failures: AnyRow[] = [];
  auditCalls: { action: string; target?: string | null; meta?: AnyRow }[] = [];

  from(table: string) {
    return new FakeQuery(this, table);
  }

  execute(table: string, op: Op) {
    switch (table) {
      case "invoices":
        return this.execInvoices(op);
      case "subscriptions":
        return this.execSubscriptions(op);
      case "subscription_intent_failures":
        return this.execFailures(op);
      default:
        throw new Error(`FakeDb: tabel tak dikenal ${table}`);
    }
  }

  private execInvoices(op: Op) {
    const id = op.filters.find(([c]) => c === "id")?.[1];
    const invoice = id ? (this.invoices.get(String(id)) ?? null) : null;
    if (!invoice) return { data: null, error: null as IntentDbError };
    if (op.kind === "select") {
      const biz = op.filters.find(([c]) => c === "business_id");
      if (biz && invoice.business_id !== biz[1]) return { data: null, error: null };
      return { data: { ...invoice }, error: null };
    }
    if (op.kind === "update") {
      if (op.orCond) {
        if (invoice.intent?.applied === true) return { data: null, error: null };
        invoice.intent = (op.patch?.intent as AnyRow | null) ?? invoice.intent;
        return { data: { id: invoice.id }, error: null };
      }
      invoice.intent = (op.patch?.intent as AnyRow | null) ?? invoice.intent;
      return { data: { id: invoice.id }, error: null };
    }
    throw new Error(`FakeDb invoices: op ${op.kind} tak didukung`);
  }

  private execSubscriptions(op: Op) {
    const id = op.filters.find(([c]) => c === "id")?.[1];
    const sub = id ? (this.subscriptions.get(String(id)) ?? null) : null;
    const statusIn = op.ins.find(([c]) => c === "status");
    const statusOk = (s: SubRow) => !statusIn || (statusIn[1] as string[]).includes(s.status);

    if (op.kind === "select") {
      if (!sub || !statusOk(sub)) return { data: null, error: null };
      return { data: { ...sub }, error: null };
    }
    if (op.kind === "update") {
      const live = sub ? this.subscriptions.get(sub.id) : undefined;
      if (!live || !statusOk(live)) return { data: null, error: null };
      Object.assign(live, op.patch ?? {});
      return { data: { id: live.id }, error: null };
    }
    throw new Error(`FakeDb subscriptions: op ${op.kind} tak didukung`);
  }

  private execFailures(op: Op) {
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
      const row = op.row as AnyRow;
      const dup = this.failures.find(
        (f) => f.invoice_id === row.invoice_id && f.reason === row.reason && f.status === "pending"
      );
      if (dup) return { data: null, error: { message: "duplicate", code: "23505" } as IntentDbError };
      this.failures.push({ ...row, id: `failure-${this.failures.length + 1}` });
      return { data: null, error: null };
    }
    if (op.kind === "update") {
      const id = op.filters.find(([c]) => c === "id")?.[1];
      const invoiceId = op.filters.find(([c]) => c === "invoice_id")?.[1];
      for (const f of this.failures) {
        if (id !== undefined && f.id !== id) continue;
        if (id === undefined && invoiceId !== undefined && f.invoice_id !== invoiceId) continue;
        Object.assign(f, op.patch ?? {});
      }
      return { data: null, error: null };
    }
    throw new Error(`FakeDb failures: op ${op.kind} tak didukung`);
  }
}

class FakeQuery {
  private op: Op = {
    kind: "select",
    filters: [],
    ins: [],
    orCond: null,
    patch: null,
    row: null,
    upsertOpts: null,
  };
  private db: FakeDb;
  private table: string;

  constructor(db: FakeDb, table: string) {
    this.db = db;
    this.table = table;
  }

  select() {
    return this;
  }
  update(patch: AnyRow) {
    this.op.kind = "update";
    this.op.patch = patch;
    return this;
  }
  insert(row: AnyRow) {
    this.op.kind = "insert";
    this.op.row = row;
    return this;
  }
  upsert(row: AnyRow, opts?: AnyRow) {
    this.op.kind = "upsert";
    this.op.row = row;
    this.op.upsertOpts = opts ?? null;
    return this;
  }
  eq(col: string, val: unknown) {
    this.op.filters.push([col, val]);
    return this;
  }
  or(cond: string) {
    this.op.orCond = cond;
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.op.ins.push([col, vals]);
    return this;
  }
  maybeSingle() {
    return Promise.resolve(this.db.execute(this.table, this.op));
  }
  then<T1 = unknown, T2 = never>(
    onfulfilled?: ((v: unknown) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null
  ): Promise<T1 | T2> {
    return Promise.resolve(this.db.execute(this.table, this.op)).then(onfulfilled, onrejected);
  }
}

function makeDeps(db: FakeDb): ApplyIntentDeps {
  return {
    db: db as unknown as IntentDb,
    audit: async (input) => {
      db.auditCalls.push(input as never);
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function seedPaidInvoice(
  db: FakeDb,
  intentItems: AnyRow[],
  opts?: { subscriptionId?: string | null }
) {
  const subscriptionId = opts && "subscriptionId" in opts ? (opts.subscriptionId ?? null) : "sub-1";
  const invoice: InvoiceRow = {
    id: "inv-1",
    business_id: "biz-1",
    subscription_id: subscriptionId,
    amount: intentItems.reduce((s, i) => s + (i.amount as number) * (i.qty as number), 0),
    status: "paid",
    intent: structuredClone({ items: intentItems }),
  };
  db.invoices.set(invoice.id, invoice);
  return invoice;
}

function seedExpiredSub(db: FakeDb, planId: string, periodEnd: string | null) {
  db.subscriptions.set("sub-1", {
    id: "sub-1",
    plan_id: planId,
    status: "expired",
    current_period_start: null,
    current_period_end: periodEnd,
    cancel_at_period_end: false,
  });
}

const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// 1. Recovery core: expired + plan sama → active, periode BARU dari now()
// ---------------------------------------------------------------------------

test("recovery: expired + plan sama → aktif, periode baru dari now (bukan extend)", async () => {
  const db = new FakeDb();
  seedExpiredSub(db, "plan-growth", "2026-08-01T00:00:00.000Z"); // mati lama
  seedPaidInvoice(db, [
    {
      type: "plan_change",
      plan_id: "plan-growth",
      code: "growth",
      name: "GROWTH",
      amount: 249000,
      qty: 1,
    },
  ]);

  const before = Date.now();
  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");
  const after = Date.now();

  const sub = db.subscriptions.get("sub-1")!;
  assert.equal(sub.status, "active");
  assert.equal(sub.plan_id, "plan-growth");
  assert.equal(sub.cancel_at_period_end, false);
  const start = new Date(sub.current_period_start!).getTime();
  const end = new Date(sub.current_period_end!).getTime();
  assert.ok(start >= before && start <= after, "current_period_start harus ≈ now()");
  assert.equal(end - start, PERIOD_DAYS * DAY, "end = nextPeriod(now())");
  // Tidak boleh extend dari period_end lama (2026-08-01).
  assert.notEqual(sub.current_period_start, "2026-08-01T00:00:00.000Z");

  assert.equal(db.invoices.get("inv-1")!.intent?.applied, true);
  assert.equal(db.failures.length, 0);
  const activated = db.auditCalls.find((a) => a.action === "subscription.plan_activated");
  assert.ok(activated);
  assert.equal(activated!.meta?.plan, "growth");
});

// ---------------------------------------------------------------------------
// 2. Recovery: pindah plan saat expired → plan baru + periode dari now()
// ---------------------------------------------------------------------------

test("recovery: expired + ganti plan → plan baru aktif, periode dari now", async () => {
  const db = new FakeDb();
  seedExpiredSub(db, "plan-growth", "2026-08-01T00:00:00.000Z");
  seedPaidInvoice(db, [
    { type: "plan_change", plan_id: "plan-pro", code: "pro", name: "PRO", amount: 499000, qty: 1 },
  ]);

  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  const sub = db.subscriptions.get("sub-1")!;
  assert.equal(sub.plan_id, "plan-pro");
  assert.equal(sub.status, "active");
  const start = new Date(sub.current_period_start!).getTime();
  assert.ok(Math.abs(Date.now() - start) < 10_000, "periode mulai dari now()");
});

// ---------------------------------------------------------------------------
// 3. Idempotensi: webhook retry tidak menggandakan periode
// ---------------------------------------------------------------------------

test("recovery: retry webhook (applied=true) → no-op, periode tidak berubah", async () => {
  const db = new FakeDb();
  seedExpiredSub(db, "plan-growth", "2026-08-01T00:00:00.000Z");
  seedPaidInvoice(db, [
    {
      type: "plan_change",
      plan_id: "plan-growth",
      code: "growth",
      name: "GROWTH",
      amount: 249000,
      qty: 1,
    },
  ]);

  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");
  const sub1 = { ...db.subscriptions.get("sub-1")! };
  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  const sub2 = db.subscriptions.get("sub-1")!;
  assert.equal(sub2.current_period_start, sub1.current_period_start);
  assert.equal(sub2.current_period_end, sub1.current_period_end);
  assert.equal(db.failures.length, 0);
});

// ---------------------------------------------------------------------------
// 4. past_due dalam grace: TETAP extend dari period_end (bukan jalur recovery)
// ---------------------------------------------------------------------------

test("past_due dalam grace + plan sama → extend dari period_end, bukan now", async () => {
  const db = new FakeDb();
  // period_end relatif ke now (masa depan) agar selalu "dalam grace".
  const periodEnd = new Date(Date.now() + 3 * DAY).toISOString();
  db.subscriptions.set("sub-1", {
    id: "sub-1",
    plan_id: "plan-growth",
    status: "past_due",
    current_period_start: new Date(Date.now() - (PERIOD_DAYS - 3) * DAY).toISOString(),
    current_period_end: periodEnd,
    cancel_at_period_end: false,
  });
  seedPaidInvoice(db, [
    {
      type: "plan_change",
      plan_id: "plan-growth",
      code: "growth",
      name: "GROWTH",
      amount: 249000,
      qty: 1,
    },
  ]);

  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  const sub = db.subscriptions.get("sub-1")!;
  assert.equal(sub.status, "active");
  assert.equal(sub.current_period_start, periodEnd, "start = period_end lama (extend)");
  assert.equal(
    new Date(sub.current_period_end!).getTime() - new Date(periodEnd).getTime(),
    PERIOD_DAYS * DAY
  );
});

// ---------------------------------------------------------------------------
// 5. Cancelled TETAP gagal — recovery hanya untuk expired (grace tidak ditembus)
// ---------------------------------------------------------------------------

test("cancelled + webhook paid → tetap SUBSCRIPTION_NOT_ACTIVE (bukan recovery)", async () => {
  const db = new FakeDb();
  db.subscriptions.set("sub-1", {
    id: "sub-1",
    plan_id: "plan-starter",
    status: "cancelled",
    current_period_start: null,
    current_period_end: "2026-08-01T00:00:00.000Z",
    cancel_at_period_end: false,
  });
  seedPaidInvoice(db, [
    {
      type: "plan_change",
      plan_id: "plan-growth",
      code: "growth",
      name: "GROWTH",
      amount: 249000,
      qty: 1,
    },
  ]);

  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  assert.equal(db.failures.length, 1);
  assert.equal(db.failures[0]!.reason, INTENT_FAILURE_REASON.SUBSCRIPTION_NOT_ACTIVE);
  assert.equal(db.subscriptions.get("sub-1")!.status, "cancelled");
  assert.notEqual(db.invoices.get("inv-1")!.intent?.applied, true, "klaim harus dirilis");
});
