/**
 * Regresi BUG silent data loss pada aktivasi invoice subscription
 * (docs/02 §2.4b).
 *
 * Skenario inti: owner cancel subscription → cron transisi ke `cancelled`
 * → webhook paid tiba terlambat. Dulu `applyInvoiceIntent` return diam-diam
 * SETELAH klaim atomik `intent.applied=true`:
 *   - klaim tidak dilepas  → retry mustahil,
 *   - tanpa audit          → tidak ada jejak,
 *   - tanpa antrean review → admin tak tahu uang masuk tanpa entitlement.
 *
 * Setelah fix, setiap early-return non-sukses wajib:
 *   - rilis klaim (applied=false / dihapus),
 *   - tulis audit subscription.intent_activation_failed,
 *   - catat blob ke subscription_intent_failures (reason + snapshot).
 * Uang TIDAK dilepas: invoice tetap status='paid'.
 *
 * Fake in-memory mengimplementasikan subset query builder Supabase yang
 * dipakai (termasuk semantik CAS `.or(...)` + filter `intent->>applied`).
 * Jalankan: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyInvoiceIntentWithDeps,
  intentToItems,
  buildReleasedIntent,
  buildFailureSnapshot,
  INTENT_FAILURE_REASON,
  type ApplyIntentDeps,
  type IntentDb,
  type IntentDbError,
} from "../src/lib/subscription-intent-apply.ts";

// ---------------------------------------------------------------------------
// In-memory fake Supabase query builder
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
  select: boolean;
};

type InvoiceRow = {
  id: string;
  number: string;
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
  current_period_end: string | null;
  current_period_start?: string | null;
  cancel_at_period_end?: boolean;
};

type AddOnRow = {
  id: string;
  subscription_id: string;
  add_on_id: string;
  quantity: number;
  status: string;
};

class FakeDb {
  invoices = new Map<string, InvoiceRow>();
  subscriptions = new Map<string, SubRow>();
  addOns: AddOnRow[] = [];
  failures: AnyRow[] = [];
  purchases: AnyRow[] = [];
  auditCalls: {
    actorId: string | null;
    businessId: string | null;
    action: string;
    target?: string | null;
    meta?: AnyRow;
  }[] = [];

  // Hook untuk mensimulasikan race: status subscription diubah SETELAH
  // SELECT tapi SEBELUM UPDATE (kasus UPDATE_NO_ROW).
  flipSubStatusAfterSelect: { id: string; status: string } | null = null;

  // Hook untuk memaksa error pada operasi insert tabel tertentu
  // (mensimulasikan kegagalan DB → INTENT_EXCEPTION).
  failInsertOn: string | null = null;

  private idSeq = 0;
  nextId(prefix: string): string {
    this.idSeq += 1;
    return `${prefix}-${this.idSeq}`;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  // -------------------------------------------------------------------------
  // Execution — mensimulasikan semantik tiap query yang dipakai produksi.
  // -------------------------------------------------------------------------

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
        throw new Error(`FakeDb: tabel tak dikenal ${table}`);
    }
  }

  private findInvoice(op: Op): InvoiceRow | null {
    const idFilter = op.filters.find(([c]) => c === "id");
    if (idFilter) return this.invoices.get(String(idFilter[1])) ?? null;
    return null;
  }

  private matchesAppliedFilter(op: Op, invoice: InvoiceRow): boolean {
    // Filter `.eq("intent->>applied", "true")` (release path).
    const appliedEq = op.filters.find(([c]) => c === "intent->>applied");
    if (appliedEq) return invoice.intent?.applied === true;
    return true;
  }

  private execInvoices(op: Op) {
    const invoice = this.findInvoice(op);
    if (!invoice) return { data: null, error: null as IntentDbError };

    if (op.kind === "select") {
      // business_id scope
      const biz = op.filters.find(([c]) => c === "business_id");
      if (biz && invoice.business_id !== biz[1]) {
        return { data: null, error: null };
      }
      return { data: { ...invoice }, error: null };
    }

    if (op.kind === "update") {
      // CAS claim path: `.or("intent->>applied.is.null,intent->>applied.neq.true")`
      if (op.orCond) {
        const appliedIsTrue = invoice.intent?.applied === true;
        if (appliedIsTrue) {
          // Sudah diklaim → CAS gagal.
          return { data: null, error: null };
        }
        invoice.intent = (op.patch?.intent as AnyRow | null) ?? invoice.intent;
        return { data: { id: invoice.id }, error: null };
      }
      // Release path: hanya jika applied===true.
      if (!this.matchesAppliedFilter(op, invoice)) {
        return { data: null, error: null };
      }
      invoice.intent = (op.patch?.intent as AnyRow | null) ?? invoice.intent;
      return { data: null, error: null };
    }

    throw new Error(`FakeDb invoices: op ${op.kind} tak didukung`);
  }

  private execSubscriptions(op: Op) {
    const idFilter = op.filters.find(([c]) => c === "id");
    const sub = idFilter ? (this.subscriptions.get(String(idFilter[1])) ?? null) : null;

    const statusIn = op.ins.find(([c]) => c === "status");
    const statusOk = sub ? !statusIn || (statusIn[1] as string[]).includes(sub.status) : false;

    if (op.kind === "select") {
      if (!sub || !statusOk) return { data: null, error: null };
      const result = { ...sub };
      // Simulasikan race SETELAH SELECT: ubah status sebelum UPDATE jalan.
      if (this.flipSubStatusAfterSelect && sub.id === this.flipSubStatusAfterSelect.id) {
        const target = this.subscriptions.get(sub.id);
        if (target) target.status = this.flipSubStatusAfterSelect.status;
        this.flipSubStatusAfterSelect = null;
      }
      return { data: result, error: null };
    }

    if (op.kind === "update") {
      // Re-check status saat ini (bisa berubah oleh race di atas).
      const live = this.subscriptions.get(sub?.id ?? "");
      const liveOk = live ? !statusIn || (statusIn[1] as string[]).includes(live.status) : false;
      if (!sub || !liveOk) return { data: null, error: null };
      Object.assign(live!, op.patch ?? {});
      return { data: { id: live!.id }, error: null };
    }

    throw new Error(`FakeDb subscriptions: op ${op.kind} tak didukung`);
  }

  private execAddOns(op: Op) {
    if (op.kind === "select") {
      const subId = op.filters.find(([c]) => c === "subscription_id")?.[1];
      const addOnId = op.filters.find(([c]) => c === "add_on_id")?.[1];
      const found = this.addOns.find((a) => a.subscription_id === subId && a.add_on_id === addOnId);
      return { data: found ? { ...found } : null, error: null };
    }
    if (op.kind === "update") {
      const id = op.filters.find(([c]) => c === "id")?.[1];
      const found = this.addOns.find((a) => a.id === id);
      if (found) Object.assign(found, op.patch ?? {});
      return { data: null, error: null };
    }
    if (op.kind === "insert") {
      if (this.failInsertOn === "subscription_add_ons") {
        return { data: null, error: { message: "db error" } as IntentDbError };
      }
      const row = op.row as AddOnRow;
      const inserted = { ...row, id: row.id ?? this.nextId("addon") };
      this.addOns.push(inserted);
      return { data: inserted, error: null };
    }
    throw new Error(`FakeDb add_ons: op ${op.kind} tak didukung`);
  }

  private execFailures(op: Op) {
    if (op.kind === "upsert") {
      const row = op.row as AnyRow;
      const ignoreDup = op.upsertOpts?.ignoreDuplicates === true;
      if (ignoreDup) {
        // Partial unique index (invoice_id, reason) WHERE status='pending'.
        const dup = this.failures.find(
          (f) =>
            f.invoice_id === row.invoice_id && f.reason === row.reason && f.status === "pending"
        );
        if (dup) return { data: null, error: null };
      }
      this.failures.push({
        ...row,
        id: this.nextId("failure"),
        created_at: new Date().toISOString(),
      });
      return { data: null, error: null };
    }
    if (op.kind === "update") {
      const invoiceId = op.filters.find(([c]) => c === "invoice_id")?.[1];
      const status = op.filters.find(([c]) => c === "status")?.[1];
      for (const f of this.failures) {
        if (invoiceId !== undefined && f.invoice_id !== invoiceId) continue;
        if (status !== undefined && f.status !== status) continue;
        Object.assign(f, op.patch ?? {});
      }
      return { data: null, error: null };
    }
    throw new Error(`FakeDb intent_failures: op ${op.kind} tak didukung`);
  }

  private execPurchases(op: Op) {
    // upsert onConflict (business_id, template_id) + ignoreDuplicates → idempotent.
    if (op.kind === "upsert") {
      const row = op.row as AnyRow;
      const dup = this.purchases.find(
        (p) => p.business_id === row.business_id && p.template_id === row.template_id
      );
      if (dup) return { data: null, error: null };
      this.purchases.push({
        ...row,
        id: this.nextId("purchase"),
        created_at: new Date().toISOString(),
      });
      return { data: null, error: null };
    }
    if (op.kind === "select") {
      const biz = op.filters.find(([c]) => c === "business_id")?.[1];
      const tpl = op.filters.find(([c]) => c === "template_id")?.[1];
      const found = this.purchases.find(
        (p) =>
          (biz === undefined || p.business_id === biz) &&
          (tpl === undefined || p.template_id === tpl)
      );
      return { data: found ? { ...found } : null, error: null };
    }
    throw new Error(`FakeDb business_template_purchases: op ${op.kind} tak didukung`);
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
    select: false,
  };
  private db: FakeDb;
  private table: string;

  constructor(db: FakeDb, table: string) {
    this.db = db;
    this.table = table;
  }

  select() {
    this.op.select = true;
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
  // Await tanpa terminal (mis. release claim / auto-dismiss).
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.db.execute(this.table, this.op)).then(onfulfilled, onrejected);
  }
}

function makeDeps(db: FakeDb): ApplyIntentDeps {
  return {
    db: db as unknown as IntentDb,
    audit: async (input) => {
      db.auditCalls.push(input);
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLAN_INTENT: AnyRow = {
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

function seedPaidPlanInvoice(db: FakeDb, opts?: { subscriptionId?: string | null }) {
  // `in` check, bukan `??` — supaya subscriptionId: null dihormati
  // (nullish coalescing akan jatuh ke default untuk null).
  const subscriptionId = opts && "subscriptionId" in opts ? (opts.subscriptionId ?? null) : "sub-1";
  const invoice: InvoiceRow = {
    id: "inv-1",
    number: "SnapyOS-INV-0001",
    business_id: "biz-1",
    subscription_id: subscriptionId,
    amount: 249000,
    status: "paid",
    intent: structuredClone(PLAN_INTENT),
  };
  db.invoices.set(invoice.id, invoice);
  return invoice;
}

// ---------------------------------------------------------------------------
// 1. Skenario utama: cancel → cron → webhook paid terlambat
// ---------------------------------------------------------------------------

test("cancel+cron lalu webhook paid: klaim dirilis, audit + antrean review dibuat, invoice tetap paid", async () => {
  const db = new FakeDb();
  const invoice = seedPaidPlanInvoice(db);
  // Subscription sudah mati (cron sudah transisi).
  db.subscriptions.set("sub-1", {
    id: "sub-1",
    plan_id: "plan-starter",
    status: "cancelled",
    current_period_end: "2026-09-01T00:00:00.000Z",
  });

  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  // (a) Klaim dilepas → retry berikutnya bisa jalan.
  assert.notEqual(db.invoices.get("inv-1")!.intent?.applied, true, "applied harus dirilis");

  // (b) Audit tercatat dengan reason benar.
  const audit = db.auditCalls.find((a) => a.action === "subscription.intent_activation_failed");
  assert.ok(audit, "audit_logs harus mencatat kegagalan aktivasi");
  assert.equal(audit!.meta?.reason, INTENT_FAILURE_REASON.SUBSCRIPTION_NOT_ACTIVE);
  assert.equal(audit!.target, "inv-1");

  // (c) Antrean review manual berisi 1 baris.
  assert.equal(db.failures.length, 1);
  const failure = db.failures[0]!;
  assert.equal(failure.reason, INTENT_FAILURE_REASON.SUBSCRIPTION_NOT_ACTIVE);
  assert.equal(failure.invoice_id, "inv-1");
  assert.equal(failure.business_id, "biz-1");
  assert.equal(failure.status, "pending");
  assert.equal(failure.amount, 249000);

  // (d) Snapshot intent tidak membawa flag CAS transient.
  assert.equal(
    (failure.intent_snapshot as AnyRow).applied,
    undefined,
    "snapshot tidak boleh menyertakan applied"
  );
  assert.ok(Array.isArray((failure.intent_snapshot as AnyRow).items));

  // (e) UANG TIDAK DILEPAS: invoice tetap paid, subscription tetap cancelled.
  assert.equal(db.invoices.get("inv-1")!.status, "paid");
  assert.equal(db.subscriptions.get("sub-1")!.status, "cancelled");
  void invoice;
});

test("retry webhook berulang dengan reason sama: antrean tidak bertambah (partial unique)", async () => {
  const db = new FakeDb();
  seedPaidPlanInvoice(db);
  db.subscriptions.set("sub-1", {
    id: "sub-1",
    plan_id: "plan-starter",
    status: "cancelled",
    current_period_end: null,
  });

  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");
  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");
  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  assert.equal(db.failures.length, 1, "retry identik harus idempoten di antrean");
  // Audit tetap tercatat per percobaan (jejak lengkap), tapi antrean satu.
  const audits = db.auditCalls.filter((a) => a.action === "subscription.intent_activation_failed");
  assert.equal(audits.length, 3);
});

// ---------------------------------------------------------------------------
// 2. UPDATE_NO_ROW: race antara SELECT dan UPDATE
// ---------------------------------------------------------------------------

test("race SELECT→UPDATE (UPDATE_NO_ROW): tercatat dengan reason berbeda", async () => {
  const db = new FakeDb();
  seedPaidPlanInvoice(db);
  db.subscriptions.set("sub-1", {
    id: "sub-1",
    plan_id: "plan-starter",
    status: "active",
    current_period_end: "2026-10-01T00:00:00.000Z",
  });
  // Setelah SELECT (lihat active), status berubah jadi cancelled sebelum UPDATE.
  db.flipSubStatusAfterSelect = { id: "sub-1", status: "cancelled" };

  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  assert.equal(db.failures.length, 1);
  assert.equal(db.failures[0]!.reason, INTENT_FAILURE_REASON.UPDATE_NO_ROW);
  assert.notEqual(db.invoices.get("inv-1")!.intent?.applied, true);
  assert.equal(db.subscriptions.get("sub-1")!.status, "cancelled");
});

// ---------------------------------------------------------------------------
// 3. MISSING_SUBSCRIPTION_ID: add-on tanpa subscription
// ---------------------------------------------------------------------------

test("invoice add-on tanpa subscription_id: tercatat MISSING_SUBSCRIPTION_ID", async () => {
  const db = new FakeDb();
  seedPaidPlanInvoice(db, { subscriptionId: null });
  db.invoices.get("inv-1")!.intent = {
    items: [
      { type: "add_on", add_on_id: "a1", code: "extra_session", name: "+1", amount: 49000, qty: 1 },
    ],
  };

  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  assert.equal(db.failures.length, 1);
  assert.equal(db.failures[0]!.reason, INTENT_FAILURE_REASON.MISSING_SUBSCRIPTION_ID);
  assert.notEqual(db.invoices.get("inv-1")!.intent?.applied, true);
});

// ---------------------------------------------------------------------------
// 4. INTENT_EXCEPTION: throw di tengah aktivasi
// ---------------------------------------------------------------------------

test("exception aktivasi: klaim dirilis, failure tercatat, error tetap dilempar", async () => {
  const db = new FakeDb();
  seedPaidPlanInvoice(db);
  db.subscriptions.set("sub-1", {
    id: "sub-1",
    plan_id: "plan-growth", // same plan → renewal path, tidak mengubah plan
    status: "active",
    current_period_end: "2026-10-01T00:00:00.000Z",
  });
  db.invoices.get("inv-1")!.intent = {
    items: [
      {
        type: "plan_change",
        plan_id: "plan-growth",
        code: "growth",
        name: "GROWTH",
        amount: 249000,
        qty: 1,
      },
      { type: "add_on", add_on_id: "a1", code: "extra_session", name: "+1", amount: 49000, qty: 1 },
    ],
  };
  // Paksa insert add-on gagal → ApiError di dalam try → catch INTENT_EXCEPTION.
  db.failInsertOn = "subscription_add_ons";

  await assert.rejects(
    () => applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1"),
    /Gagal mengaktifkan add-on/
  );

  assert.equal(db.failures.length, 1);
  assert.equal(db.failures[0]!.reason, INTENT_FAILURE_REASON.INTENT_EXCEPTION);
  assert.notEqual(db.invoices.get("inv-1")!.intent?.applied, true);
  // Plan sempat ter-update sebelum add-on gagal — itu fakta, bukan bug:
  // klaim dirilis agar retry bisa melanjutkan add-on (plan update idempotent).
  assert.equal(db.subscriptions.get("sub-1")!.status, "active");
});

// ---------------------------------------------------------------------------
// 5. Sukses path: semantik CAS dipertahankan + auto-dismiss tiket basi
// ---------------------------------------------------------------------------

test("sukses path: plan aktif, applied=true permanen, tanpa failure row", async () => {
  const db = new FakeDb();
  seedPaidPlanInvoice(db);
  db.subscriptions.set("sub-1", {
    id: "sub-1",
    plan_id: "plan-starter",
    status: "past_due",
    current_period_end: "2026-09-01T00:00:00.000Z",
  });

  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  const sub = db.subscriptions.get("sub-1")!;
  assert.equal(sub.plan_id, "plan-growth");
  assert.equal(sub.status, "active");
  // CAS sukses TIDAK diubah: applied=true permanen sebagai penanda idempotensi.
  assert.equal(db.invoices.get("inv-1")!.intent?.applied, true);
  assert.equal(db.failures.length, 0);
  const activated = db.auditCalls.find((a) => a.action === "subscription.plan_activated");
  assert.ok(activated);
  assert.equal(activated!.meta?.plan, "growth");
});

test("sukses path setelah tiket pending: antrean pending di-dismiss otomatis", async () => {
  const db = new FakeDb();
  seedPaidPlanInvoice(db);
  // Preexisting tiket pending dari kegagalan sebelumnya.
  db.failures.push({
    id: "failure-old",
    invoice_id: "inv-1",
    business_id: "biz-1",
    reason: INTENT_FAILURE_REASON.SUBSCRIPTION_NOT_ACTIVE,
    status: "pending",
  });
  db.subscriptions.set("sub-1", {
    id: "sub-1",
    plan_id: "plan-starter",
    status: "active",
    current_period_end: "2026-10-01T00:00:00.000Z",
  });

  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  assert.equal(db.subscriptions.get("sub-1")!.status, "active");
  assert.equal(db.failures[0]!.status, "dismissed");
});

// ---------------------------------------------------------------------------
// 6. Idempotensi klaim: applied=true → no-op, tanpa failure/audit baru
// ---------------------------------------------------------------------------

test("sudah applied=true: no-op total (tidak menimpa, tidak mencatat gagal)", async () => {
  const db = new FakeDb();
  const invoice = seedPaidPlanInvoice(db);
  invoice.intent = { ...structuredClone(PLAN_INTENT), applied: true };
  db.subscriptions.set("sub-1", {
    id: "sub-1",
    plan_id: "plan-starter",
    status: "active",
    current_period_end: "2026-10-01T00:00:00.000Z",
  });

  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  assert.equal(db.failures.length, 0);
  assert.equal(db.auditCalls.length, 0);
  assert.equal(db.subscriptions.get("sub-1")!.plan_id, "plan-starter", "plan tidak boleh berubah");
});

test("invoice bukan paid → no-op tanpa failure (belum settlement)", async () => {
  const db = new FakeDb();
  const invoice = seedPaidPlanInvoice(db);
  invoice.status = "pending";
  db.subscriptions.set("sub-1", {
    id: "sub-1",
    plan_id: "plan-starter",
    status: "active",
    current_period_end: "2026-10-01T00:00:00.000Z",
  });

  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-1");

  assert.equal(db.failures.length, 0);
  assert.equal(invoice.intent?.applied, undefined);
});

// ---------------------------------------------------------------------------
// 7. Pure helpers
// ---------------------------------------------------------------------------

test("buildReleasedIntent: applied=false + applied_at=null, pertahankan sisanya", () => {
  const released = buildReleasedIntent({
    items: [{ type: "plan_change", plan_id: "p", amount: 1, qty: 1 }],
    applied: true,
    applied_at: "2026-09-01T00:00:00.000Z",
  } as never);
  assert.equal(released.applied, false);
  assert.equal(released.applied_at, null);
  assert.ok(Array.isArray(released.items));
});

test("buildFailureSnapshot: membuang flag CAS, mempertahankan item", () => {
  const snapshot = buildFailureSnapshot({
    items: [{ type: "plan_change", plan_id: "p", amount: 1, qty: 1 }],
    applied: true,
    applied_at: "2026-09-01T00:00:00.000Z",
  } as never);
  assert.equal(snapshot.applied, undefined);
  assert.equal(snapshot.applied_at, undefined);
  assert.ok(Array.isArray(snapshot.items));
});

test("intentToItems: add-on-only tetap tidak menghasilkan plan_change", () => {
  const items = intentToItems(
    { items: [{ type: "add_on", add_on_id: "a", amount: 49000, qty: 2 }] },
    98000
  );
  assert.equal(items.length, 1);
  assert.equal(items[0]!.type, "add_on");
});

test("intentToItems: template_purchase legacy shape dinormalisasi benar", () => {
  const items = intentToItems(
    { type: "template_purchase", template_id: "tpl-1", name: "Frame Wedding" },
    50000
  );
  assert.equal(items.length, 1);
  assert.equal(items[0]!.type, "template_purchase");
  assert.equal(items[0]!.template_id, "tpl-1");
  assert.equal(items[0]!.amount, 50000);
});

test("template_purchase paid: menulis kepemilikan (idempotent via onConflict)", async () => {
  const db = new FakeDb();
  const invoice: InvoiceRow = {
    id: "inv-tpl",
    number: "SnapyOS-INV-0002",
    business_id: "biz-1",
    subscription_id: null,
    amount: 50000,
    status: "paid",
    intent: {
      type: "template_purchase",
      items: [
        {
          type: "template_purchase",
          template_id: "tpl-1",
          name: "Frame Wedding",
          amount: 50000,
          qty: 1,
        },
      ],
    },
  };
  db.invoices.set(invoice.id, invoice);

  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-tpl");
  assert.equal(db.purchases.length, 1);
  assert.equal(db.purchases[0]!.template_id, "tpl-1");
  assert.equal(db.purchases[0]!.business_id, "biz-1");
  assert.equal(db.purchases[0]!.price, 50000);

  // Audit template.purchased tercatat.
  const audit = db.auditCalls.find((a) => a.action === "template.purchased");
  assert.ok(audit, "audit template.purchased harus tercatat");
  assert.equal(audit!.target, "tpl-1");

  // Idempotent: panggil ulang tidak menggandakan kepemilikan.
  await applyInvoiceIntentWithDeps(makeDeps(db), "biz-1", "inv-tpl");
  assert.equal(db.purchases.length, 1);
});
