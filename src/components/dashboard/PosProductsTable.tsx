"use client";

import { Fragment, useActionState, useState } from "react";
import { Pencil, Plus, PowerOff, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { RecordCard } from "@/components/ui/record-card";
import { RecordCollection } from "@/components/ui/record-collection";
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
 * PosProductsTable - CRUD produk POS (docs/pos/03 §3.2).
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
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...categories])];

  const statusBadge = (active: boolean) => (
    <span
      className={
        active
          ? "inline-flex h-6 items-center border-2 border-ink bg-accent-3 px-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink"
          : "inline-flex h-6 items-center border-2 border-ink bg-muted px-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground"
      }
    >
      {active ? "aktif" : "nonaktif"}
    </span>
  );

  const table = (
    <div className="overflow-x-auto border-2 border-ink bg-surface shadow-hard">
      <table className="w-full border-collapse text-left lg:min-w-[820px]">
        <caption className="sr-only">Daftar produk POS</caption>
        <thead>
          <tr className="border-b-2 border-ink bg-ink font-mono text-[11px] uppercase tracking-[0.12em] text-bg">
            <th scope="col" className="hidden px-4 py-3.5 text-right md:table-cell">
              No
            </th>
            <th scope="col" className="px-4 py-3.5">
              Produk
            </th>
            <th scope="col" className="hidden px-4 py-3.5 lg:table-cell">
              SKU
            </th>
            <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
              Kategori
            </th>
            <th scope="col" className="px-4 py-3.5 text-right">
              Harga
            </th>
            <th scope="col" className="hidden px-4 py-3.5 text-right lg:table-cell">
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
                <td className="hidden px-4 py-3 text-right font-mono text-xs font-bold text-muted-foreground md:table-cell">
                  {String(index + 1).padStart(2, "0")}
                </td>
                <td className="px-4 py-3 font-mono text-sm font-bold uppercase tracking-[0.05em]">
                  {product.name}
                </td>
                <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground lg:table-cell">
                  {product.sku ?? "-"}
                </td>
                <td className="hidden px-4 py-3 font-mono text-xs uppercase md:table-cell">
                  {product.category}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm font-bold tabular-nums">
                  {formatIDR(product.price)}
                </td>
                <td className="hidden px-4 py-3 text-right font-mono text-sm tabular-nums lg:table-cell">
                  {product.stock === null ? "-" : product.stock}
                </td>
                <td className="px-4 py-3">{statusBadge(product.is_active)}</td>
                {canManage && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <IconButton
                        label={`Ubah produk ${product.name}`}
                        icon={Pencil}
                        compact
                        aria-expanded={editingId === product.id}
                        onClick={() => setEditingId(editingId === product.id ? null : product.id)}
                      />
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
                          compact
                        />
                      )}
                    </div>
                  </td>
                )}
              </tr>
              {editingId === product.id && canManage && (
                <tr className="border-b-2 border-ink/10 bg-muted">
                  <td colSpan={8} className="px-4 py-3 md:px-6">
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
  );

  const grid = (
    <ul
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      aria-label="Produk POS (tampilan kotak)"
    >
      {products.map((product) => (
        <li key={product.id} className="min-w-0">
          <RecordCard
            title={product.name}
            subtitle={product.sku ?? undefined}
            badge={statusBadge(product.is_active)}
            meta={[
              { label: "Kategori", value: product.category },
              { label: "Harga", value: formatIDR(product.price) },
              { label: "Stok", value: product.stock === null ? "-" : product.stock },
            ]}
            actions={
              canManage ? (
                <>
                  <IconButton
                    label={`Ubah produk ${product.name}`}
                    icon={Pencil}
                    compact
                    onClick={() => setEditingId(product.id)}
                  />
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
                      compact
                    />
                  )}
                </>
              ) : undefined
            }
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <Collapsible open={createOpen} onOpenChange={setCreateOpen}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 items-center border-2 border-ink bg-ink px-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-bg">
                Produk
              </span>
              <span className="font-mono text-xs font-bold uppercase tracking-[0.1em]">
                {String(products.length).padStart(2, "0")}
              </span>
            </div>
            <CollapsibleTrigger aria-label="Buka form produk baru" title="Produk baru">
              <Plus aria-hidden />
              <span className="sr-only">Produk baru</span>
            </CollapsibleTrigger>
          </div>
          <CollapsiblePanel className="mt-4">
            <form
              action={createAction}
              className="flex flex-col gap-6 border-2 border-ink bg-surface p-5 shadow-hard md:p-6"
              noValidate
            >
              <div className="flex items-center gap-3 border-b-2 border-ink pb-4">
                <Plus className="size-4" aria-hidden />
                <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
                  {"Produk baru"}
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
        <EmptyState
          icon={Tag}
          eyebrow="Belum ada produk"
          title="Katalog POS masih kosong"
          body="Katalog ini dipakai semua booth POS: keychain, gantungan, cetak tambahan, merchandise. Tambahkan produk pertama untuk mulai menjual di terminal kasir."
          cta={
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              Produk pertama
            </Button>
          }
        />
      ) : (
        <RecordCollection
          storageKey="snapyos.view.pos-products"
          label="Daftar produk POS"
          list={table}
          grid={grid}
        />
      )}
    </div>
  );
}
