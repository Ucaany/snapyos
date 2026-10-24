/**
 * Deklarasi ambient untuk `node:sqlite` (Node >= 22.5, stabil di 24).
 *
 * `@types/node@20` belum memuat modul ini, jadi `import ... from "node:sqlite"`
 * gagal typecheck tanpa deklarasi. Hanya bagian yang dipakai runtime yang
 * dideklarasikan — bukan salinan lengkap API Node.
 *
 * Hapus berkas ini saat @types/node sudah memuat `node:sqlite`.
 */
declare module "node:sqlite" {
  export type SQLInputValue = null | number | bigint | string | Uint8Array;

  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    run(...anonymousParameters: SQLInputValue[]): StatementResultingChanges;
    get(...anonymousParameters: SQLInputValue[]): unknown;
    all(...anonymousParameters: SQLInputValue[]): unknown[];
    iterate(...anonymousParameters: SQLInputValue[]): IterableIterator<unknown>;
  }

  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
    enableDoubleQuotedStringLiterals?: boolean;
    allowExtension?: boolean;
    timeout?: number;
  }

  export class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions);
    open(): void;
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    readonly isOpen: boolean;
  }
}
