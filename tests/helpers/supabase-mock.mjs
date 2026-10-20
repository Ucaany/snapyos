/**
 * Mock klien Supabase untuk tes unit.
 *
 * Meniru rantai PostgREST yang dipakai app (`from().select().eq().maybeSingle()`)
 * dan mencatat setiap langkah, lalu menyerahkan hasilnya ke handler per-tabel
 * yang ditulis tes. Tujuannya menguji LOGIKA modul (urutan cek, fail-closed,
 * isolasi tenant), bukan SQL-nya.
 *
 * Pemakaian:
 *   globalThis.__SB_STUB = () => mockSupabase({
 *     business_members: ({ steps }) => ({ data: {...}, error: null }),
 *   });
 *
 * Handler menerima `{ table, steps }`; `steps` = daftar `{ method, args }`.
 * Bila tabel tidak punya handler → `{ data: null, error: null }`.
 */

/** Buat builder yang bisa di-await dan dirantai. */
function makeBuilder(table, steps, handlers) {
  const builder = {
    steps,
    select(...args) {
      steps.push({ method: "select", args });
      return builder;
    },
    insert(...args) {
      steps.push({ method: "insert", args });
      return builder;
    },
    update(...args) {
      steps.push({ method: "update", args });
      return builder;
    },
    delete(...args) {
      steps.push({ method: "delete", args });
      return builder;
    },
    eq(...args) {
      steps.push({ method: "eq", args });
      return builder;
    },
    neq(...args) {
      steps.push({ method: "neq", args });
      return builder;
    },
    in(...args) {
      steps.push({ method: "in", args });
      return builder;
    },
    is(...args) {
      steps.push({ method: "is", args });
      return builder;
    },
    not(...args) {
      steps.push({ method: "not", args });
      return builder;
    },
    gte(...args) {
      steps.push({ method: "gte", args });
      return builder;
    },
    lte(...args) {
      steps.push({ method: "lte", args });
      return builder;
    },
    lt(...args) {
      steps.push({ method: "lt", args });
      return builder;
    },
    gt(...args) {
      steps.push({ method: "gt", args });
      return builder;
    },
    or(...args) {
      steps.push({ method: "or", args });
      return builder;
    },
    order(...args) {
      steps.push({ method: "order", args });
      return builder;
    },
    limit(...args) {
      steps.push({ method: "limit", args });
      return builder;
    },
    range(...args) {
      steps.push({ method: "range", args });
      return builder;
    },
    /** `.single()` / `.maybeSingle()` — hasil sama, hanya penanda. */
    single() {
      steps.push({ method: "single", args: [] });
      return run(table, steps, handlers);
    },
    maybeSingle() {
      steps.push({ method: "maybeSingle", args: [] });
      return run(table, steps, handlers);
    },
    /** Await langsung pada builder (mis. `await supabase.from(t).select()`). */
    then(onFulfilled, onRejected) {
      return run(table, steps, handlers).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

/** Jalankan handler tabel; selalu mengembalikan Promise bentuk PostgREST. */
function run(table, steps, handlers) {
  const handler = handlers[table];
  const result =
    typeof handler === "function" ? handler({ table, steps }) : { data: null, error: null };
  return Promise.resolve({ count: null, ...result });
}

/** Klien palsu: `from(table)` mengembalikan builder baru per pemanggilan. */
export function mockSupabase(handlers = {}) {
  return {
    from(table) {
      return makeBuilder(table, [], handlers);
    },
  };
}

/** Bantu: cari langkah pertama dengan method tertentu (mis. nilai `eq`). */
export function stepArgs(steps, method) {
  return steps.filter((s) => s.method === method).map((s) => s.args);
}

/** Bantu: nilai argumen kedua dari semua langkah `eq` (kolom → nilai). */
export function eqPairs(steps) {
  return Object.fromEntries(
    steps.filter((s) => s.method === "eq").map((s) => [s.args[0], s.args[1]])
  );
}
