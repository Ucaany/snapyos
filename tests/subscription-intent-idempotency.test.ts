/**
 * Idempotensi aktivasi plan (docs/02 §2.4b) — regresi bug double period
 * extension saat retry pasca partial failure.
 *
 * Skenario: plan sudah ter-update pada percobaan pertama (mis. add-on gagal
 * setelahnya → claim dilepas → retry). Pada retry, plan_id sudah cocok dan
 * current_period_end masih di masa depan → apply ulang TIDAK boleh extend
 * periode lagi. Hanya extend saat periode sudah expired/past (renewal).
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyInvoiceIntentWithDeps,
  type ApplyIntentDeps,
  type IntentDb,
  type IntentDbError,
} from "../src/lib/subscription-intent-apply.ts";

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

class FakeDb {
  invoices = new Map<
    string,
    {
      id: string;
      number: string;
      business_id: string;
      subscription_id: string | null;
      amount: number;
      status: string;
      intent: AnyRow | null;
    }
  >();
  subscriptions = new Map<
    string,
    {
      id: string;
      plan_id: string | null;
      status: string;
      current_period_end: string | null;
      current_period_start?: string | null;
      cancel_at_period_end?: boolean;
    }
  >();
  addOns: AnyRow[] = [];
  failures: AnyRow[] = [];
  purchases: AnyRow[] = [];
  auditCalls: { action: string; meta?: AnyRow }[] = [];

  from(table: string) {
    return new FakeQuery(this, table);
  }

  execInvoices(op: Op) {
    const id = op.filters.find(([c]) => c === "id")?.[1];
    const inv = id ? this.invoices.get(String(id)) : null;
    if (!inv) return { data: null, error: null as IntentDbError };
    if (op.kind === "select") return { data: { ...inv }, error: null };
    if (op.kind === "update") {
      if (op.orCond) {
        if (inv.intent?.applied === true) return { data: null, error: null };
        inv.intent = (op.patch?.intent as AnyRow | null) ?? inv.intent;
        return { data: { id: inv.id }, error: null };
      }
      const appliedEq = op.filters.find(([c]) => c === "intent->>applied");
      if (appliedEq && inv.intent?.applied !== true) return { data: null, error: null };
      inv.intent = (op.patch?.intent as AnyRow | null) ?? inv.intent;
      return { data: null, error: null };
    }
    throw new Error("unsupported");
  }

  execSubscriptions(op: Op) {
    const id = op.filters.find(([c]) => c === "id")?.[1];
    const sub = id ? this.subscriptions.get(String(id)) : null;
    const statusIn = op.ins.find(([c]) => c === "status");
    const ok = sub && (!statusIn || (statusIn[1] as string[]).includes(sub.status));
    if (op.kind === "select") return { data: sub && ok ? { ...sub } : null, error: null };
    if (op.kind === "update") {
      if (!sub || !ok) return { data: null, error: null };
      Object.assign(sub, op.patch ?? {});
      return { data: { id: sub.id }, error: null };
    }
    throw new Error("unsupported");
  }

  execAddOns(op: Op) {
    if (op.kind === "select") return { data: null, error: null };
    if (op.kind === "update") return { data: null, error: null };
    if (op.kind === "insert") {
      this.addOns.push(op.row!);
      return { data: op.row, error: null };
    }
    throw new Error("unsupported");
  }

  execFailures(op: Op) {
    if (op.kind === "upsert") {
      this.failures.push(op.row!);
      return { data: null, error: null };
    }
    if (op.kind === "update") return { data: null, error: null };
    throw new Error("unsupported");
  }

  execPurchases(op: Op) {
    if (op.kind === "upsert") {
      this.purchases.push(op.row!);
      return { data: null, error: null };
    }
    if (op.kind === "select") return { data: null, error: null };
    throw new Error("unsupported");
  }

  execute(table: string, op: Op) {
    switch (table) {
      case "invoices":
        return this.execInvoices(op);
      case "subscriptions":
        return this.execSubscriptions(op);
      case "subscription_add_ons":
        return this.execAddOns(op);
      case "subscription_intent_failures":
        return this.execFailures(op);
      case "business_template_purchases":
        return this.execPurchases(op);
      default:
        throw new Error(`tabel tak dikenal ${table}`);
    }
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
  single() {
    return Promise.resolve(this.db.execute(this.table, this.op));
  }
  then<TResult1 = unknown, TResult2 = never>(
    onf?: (v: unknown) => TResult1 | PromiseLike<TResult1>,
    onr?: (r: unknown) => TResult2 | PromiseLike<TResult2>
  ) {
    return Promise.resolve(this.db.execute(this.table, this.op)).then(onf, onr);
  }
}

function makeDeps(db: FakeDb): ApplyIntentDeps {
  return {
    db: db as unknown as IntentDb,
    audit: async (i) => {
      db.auditCalls.push(i);
    },
  };
}

const PLAN_INTENT = {
  items: [
    {
      type: "plan_change",
      plan_id: "plan-growth",
      code: "growth",
      name: "GROWTH",
      amount: 249000,
      qty: 1,
    },
  ],
};

function seed(db: FakeDb, planId: string, periodEnd: string | null) {
  db.invoices.set("inv-1", {
    id: "inv-1",
    number: "INV-1",
    business_id: "biz-1",
    subscription_id: "sub-1",
    amount: 249000,
    status: "paid",
    intent: structuredClone(PLAN_INTENT),
  });
  db.subscriptions.set("sub-1", {
    id: "sub-1",
    plan_id: planId,
    status: "active",
    current_period_end: periodEnd,
  });
}

test("plan sudah applied (plan_id sama + periode aktif ke depan): retry TIDAK extend periode", async () => {
  const db = new FakeDb();
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
  seed(db, "plan-growth", future); // plan_id sudah cocok

  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  const sub = db.subscriptions.get("sub-1")!;
  // Periode tidak berubah — tetap sama (tidak di-extend).
  assert.equal(sub.current_period_end, future, "periode tidak boleh di-extend saat sudah applied");
  // Tidak ada audit plan_activated karena tidak ada UPDATE.
  assert.equal(
    db.auditCalls.some((a) => a.action === "subscription.plan_activated"),
    false
  );
});

test("plan sama tapi periode sudah lewat (expired): retry = renewal, periode baru dari now", async () => {
  const db = new FakeDb();
  const past = new Date(Date.now() - 10 * 86_400_000).toISOString();
  seed(db, "plan-growth", past); // plan_id cocok tapi periode lampau

  const before = Date.now();
  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  const sub = db.subscriptions.get("sub-1")!;
  const newEnd = new Date(sub.current_period_end!).getTime();
  assert.ok(newEnd > before, "periode harus di-renew saat expired");
  assert.equal(
    db.auditCalls.some((a) => a.action === "subscription.plan_activated"),
    true
  );
});

test("plan beda (isActualPlanChange): periode baru penuh dari now", async () => {
  const db = new FakeDb();
  seed(db, "plan-starter", new Date(Date.now() + 10 * 86_400_000).toISOString());

  const before = Date.now();
  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  const sub = db.subscriptions.get("sub-1")!;
  assert.equal(sub.plan_id, "plan-growth");
  assert.ok(new Date(sub.current_period_end!).getTime() > before);
});
