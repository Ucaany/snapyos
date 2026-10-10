import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatIDR } from "@/lib/dashboard-math";
import { createAddOnAction, updateAddOnAction } from "@/server/admin-actions";
import { listAddOns } from "@/server/admin";

/**
 * Admin add-ons - create/edit harga & unit, active/inactive (docs/10 §10.2).
 * Add-on +1 sesi menaikkan limit sesi konkuren owner (docs/02 §2.6).
 */
export default async function AdminAddOnsPage() {
  const addOns = await listAddOns();

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {"/// ADMIN - ADD-ONS"}
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-tight md:text-4xl">
          Manajemen Add-on
        </h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {addOns.length} add-on terdaftar
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Buat Add-on Baru</CardTitle>
          <CardDescription>Contoh: +1 sesi konkuren Rp49.000/bln, unit &quot;session&quot;.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminActionForm
            action={createAddOnAction}
            submitLabel="Buat Add-on"
            className="grid grid-cols-2 gap-4 md:grid-cols-4"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="addon-code" className="font-mono text-[10px] uppercase tracking-[0.12em]">
                Kode
              </label>
              <Input id="addon-code" name="code" placeholder="extra-session" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="addon-name" className="font-mono text-[10px] uppercase tracking-[0.12em]">
                Nama
              </label>
              <Input id="addon-name" name="name" placeholder="Add-on +1 Sesi" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="addon-price" className="font-mono text-[10px] uppercase tracking-[0.12em]">
                Harga / bln (IDR)
              </label>
              <Input id="addon-price" name="price_monthly" type="number" defaultValue={49000} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="addon-unit" className="font-mono text-[10px] uppercase tracking-[0.12em]">
                Unit
              </label>
              <Input id="addon-unit" name="unit" defaultValue="session" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="addon-storage" className="font-mono text-[10px] uppercase tracking-[0.12em]">
                Storage (MB)
              </label>
              <Input id="addon-storage" name="storage_mb" type="number" placeholder="kosong = bukan add-on storage" />
            </div>
          </AdminActionForm>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {addOns.length === 0 ? (
          <AdminEmptyState heading="/// BELUM ADA ADD-ON">
            Buat add-on pertama di atas, dipakai owner untuk menambah limit sesi konkuren.
          </AdminEmptyState>
        ) : (
          addOns.map((a) => (
            <div key={a.id} className="border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_#111111]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <span className="font-display text-lg uppercase tracking-tight">{a.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {a.code} · unit {a.unit}
                    {a.storage_mb ? ` · +${a.storage_mb} MB` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-3 font-mono text-xs font-bold">
                  {formatIDR(a.price_monthly)}/BLN
                  <StatusBadge status={a.is_active ? "active" : "inactive"} />
                </span>
              </div>
              <div className="mt-4 border-t-2 border-ink/10 pt-4">
                <AdminActionForm
                  action={updateAddOnAction}
                  hidden={{ addOnId: a.id }}
                  submitLabel="Simpan"
                  className="grid grid-cols-2 gap-4 md:grid-cols-4"
                >
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`name-${a.id}`} className="font-mono text-[10px] uppercase tracking-[0.12em]">
                      Nama
                    </label>
                    <Input id={`name-${a.id}`} name="name" defaultValue={a.name} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`price-${a.id}`} className="font-mono text-[10px] uppercase tracking-[0.12em]">
                      Harga / bln
                    </label>
                    <Input id={`price-${a.id}`} name="price_monthly" type="number" defaultValue={a.price_monthly} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`unit-${a.id}`} className="font-mono text-[10px] uppercase tracking-[0.12em]">
                      Unit
                    </label>
                    <Input id={`unit-${a.id}`} name="unit" defaultValue={a.unit} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`storage-${a.id}`} className="font-mono text-[10px] uppercase tracking-[0.12em]">
                      Storage (MB)
                    </label>
                    <Input
                      id={`storage-${a.id}`}
                      name="storage_mb"
                      type="number"
                      defaultValue={a.storage_mb ?? ""}
                    />
                  </div>
                  <label className="flex items-end gap-2 pb-3 font-mono text-xs uppercase">
                    {/* hidden "false" dulu → unchecked tetap terkirim (H2 audit) */}
                    <input type="hidden" name="is_active" value="false" />
                    <input
                      type="checkbox"
                      name="is_active"
                      value="true"
                      defaultChecked={a.is_active}
                      className="size-4 accent-[#ffd400]"
                    />
                    Aktif
                  </label>
                </AdminActionForm>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
