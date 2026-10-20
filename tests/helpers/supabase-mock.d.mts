/** Tipe untuk mock klien Supabase (`tests/helpers/supabase-mock.mjs`). */

export type Step = { method: string; args: unknown[] };

/** Handler per-tabel: menerima langkah query, mengembalikan bentuk PostgREST. */
export type TableHandler = (ctx: { table: string; steps: Step[] }) => {
  data?: unknown;
  error?: unknown;
};

export declare function mockSupabase(handlers?: Record<string, TableHandler>): unknown;

/** Semua argumen dari langkah dengan method tertentu. */
export declare function stepArgs(steps: Step[], method: string): unknown[][];

/** Peta kolom → nilai dari semua langkah `eq`. */
export declare function eqPairs(steps: Step[]): Record<string, unknown>;
