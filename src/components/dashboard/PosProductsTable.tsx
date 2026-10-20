"use client";

import { Fragment, useActionState, useState } from "react";
import { Pencil, Plus, PowerOff, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DeleteConfirmForm } from "@/components/dashboard/DeleteConfirmForm";
import { PosProductEditForm } from "@/components/dashboard/PosProductEditForm";
import { PosProductFields } from "@/components/dashboard/PosProductFields";
import { formatIDR } from "@/lib/dashboard-math";
import type { PosProductRow } from "@/server/pos-products";
import type { FormState } from "@/server/auth-actions";
import { posCreateProductAction, posDeactivateProductAction } from "@/server/pos-actions";
import { POS_CATEGORIES } from "@/types/pos";

const initial: FormState = {};

const DEFAULT_CATEGORIES: readonly string[] = POS_CATEGORIES;

/**
 * PosProductsTable — CRUD produk POS (docs/pos/03 §3.2).
 * Pola OutletsTable: create di Collapsible, edit inline per baris, soft delete.
 */
export function PosProductsTable({
  products,
  categories,
  canManage,
}: {
  products: PosProductRow[];
  categories: string[];
  canManage: boolean;
}) {
  const [createState, createAction, creating] = useActionState(posCreateProductAction, initial);
  const [editingId, setEditingId] = useState<string | null>(null);

  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...categories])];

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <Collapsible>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 items-center border-2 border-ink bg-ink px-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-bg">
                Produk
              </span>
              <span className="font-mono text-xs font-bold uppercase tracking-[0.1em]">
                {String(products.length).padStart(2, "0")}
              </span>
            </div>
            <CollapsibleTrigger className="min-h-11 px-4" aria-label="Buka form produk baru">
              <Plus aria-hidden />
              Produk baru
            </CollapsibleTrigger>
          </div>
          <CollapsiblePanel className="mt-4">
            <form
              action={createAction}
              className="flex flex-col gap-6 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111] md:p-6"
              noValidate
            >
              <div className="flex items-center gap-3 border-b-2 border-ink pb-4">
                <Plus className="size-4" aria-hidden />
                <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
                  {"/// Produk baru"}
                </p>
              </div>
              <PosProductFields categories={allCategories} state={createState} pending={creating} />
              {createState.error && (
                <p
                  role="alert"
                  className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
                >
                  {createState.error}
                </p>
              )}
              <div className="flex items-center justify-end gap-3 border-t-2 border-ink/10 pt-4">
                <Button type="submit" size="sm" disabled={creating}>
                  {creating ? "Menyimpan\u2026" : "Simpan produk"}
                </Button>
              </div>
            </form>
          </CollapsiblePanel>
        </Collapsible>
      )}

      {products.length === 0 ? (
        <div className="flex flex-col items-start gap-4 border-2 border-dashed border-ink/40 bg-muted p-8">
          <Tag className="size-8" aria-hidden />
          <p className="font-mono text-sm font-bold uppercase tracking-[0.15em]">
            {"/// Belum ada produk"}
          </p>
          <p className="max-w-[55ch] text-sm leading-relaxed text-muted-foreground">
            Katalog ini dipakai semua booth POS: keychain, gantungan, cetak tambahan, merchandise.
            Tambahkan produk pertama untuk mulai menjual di terminal kasir.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <caption className="sr-only">Daftar produk POS</caption>
            <thead>
              <tr className="border-b-2 border-ink bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                <th scope="col" className="px-4 py-3.5 text-right">
                  No
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Produk
                </th>
                <th scope="col" className="px-4 py-3.5">
                  SKU
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Kategori
                </th>
                <th scope="col" className="px-4 py-3.5 text-right">
                  Harga
                </th>
                <th scope="col" className="px-4 py-3.5 text-right">
                  Stok
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Status
                </th>
                {canManage && (
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Aksi
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {products.map((product, index) => (
                <Fragment key={product.id}>
                  <tr className="border-b-2 border-ink/10 transition-colors hover:bg-muted/60">
                    <td className="px-4 py-4 text-right font-mono text-xs font-bold text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-4 font-mono text-sm font-bold uppercase tracking-[0.05em]">
                      {product.name}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-muted-foreground">
                      {product.sku ?? "-"}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs uppercase">{product.category}</td>
                    <td className="px-4 py-4 text-right font-mono text-sm font-bold">
                      {formatIDR(product.price)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-sm">
                      {product.stock === null ? "-" : product.stock}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={
                          product.is_active
                            ? "inline-flex h-6 items-center border-2 border-ink bg-accent-3 px-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink"
                            : "inline-flex h-6 items-center border-2 border-ink bg-muted px-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground"
                        }
                      >
                        {product.is_active ? "aktif" : "nonaktif"}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label={`Ubah produk ${product.name}`}
                            aria-expanded={editingId === product.id}
                            onClick={() =>
                              setEditingId(editingId === product.id ? null : product.id)
                            }
                          >
                            <Pencil aria-hidden />
                          </Button>
                          {product.is_active && (
                            <DeleteConfirmForm
                              action={posDeactivateProductAction}
                              id={product.id}
                              title="Nonaktifkan produk?"
                              description={`Produk ${product.name} tidak akan muncul di kasir POS. Riwayat order tetap utuh dan dapat diaktifkan kembali kapan saja.`}
                              confirmLabel="Nonaktifkan"
                              variant="default"
                              triggerLabel={`Nonaktifkan produk ${product.name}`}
                              triggerTitle="Nonaktifkan (riwayat order tetap utuh)"
                              triggerIcon={<PowerOff className="h-4 w-4" aria-hidden="true" />}
                            />
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                  {editingId === product.id && canManage && (
                    <tr className="border-b-2 border-ink/10 bg-muted">
                      <td colSpan={8} className="px-4 py-4 md:px-6">
                        <PosProductEditForm
                          product={product}
                          categories={allCategories}
                          onDone={() => setEditingId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
