import { CheckCircle2, HardDrive, LayoutGrid, Package, Wallet } from "lucide-react";

import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminCheckbox } from "@/components/admin/AdminCheckbox";
import { AdminDisclosure } from "@/components/admin/AdminDisclosureCard";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionHeading } from "@/components/admin/AdminSectionHeading";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import { Input } from "@/components/admin/ui/input";
import { formatIDR } from "@/lib/dashboard-math";
import { storageAddOnDisplayName } from "@/lib/storage-units";
import { createAddOnAction, updateAddOnAction } from "@/server/admin-actions";
import { listAddOns } from "@/server/admin";
import { Label } from "@/components/admin/ui/label";

/**
 * Admin add-ons - create/edit harga & unit, active/inactive (docs/10 §10.2).
 * Add-on +1 sesi menaikkan limit sesi konkuren owner (docs/02 §2.6).
 */
export default async function AdminAddOnsPage() {
  const addOns = await listAddOns();
  const activeAddOns = addOns.filter((addOn) => addOn.is_active).length;
  const storageAddOns = addOns.filter((addOn) => addOn.storage_mb).length;
  const averagePrice = addOns.length
    ? Math.round(addOns.reduce((total, addOn) => total + addOn.price_monthly, 0) / addOns.length)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={Package}
        title="Manajemen Add-on"
        meta={`${addOns.length} add-on terdaftar · ${activeAddOns} aktif`}
      />

      <section aria-labelledby="admin-add-ons-metrics" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-add-ons-metrics"
          title="Ikhtisar"
          description="Add-on yang dapat dibeli owner di samping paket utama."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            accent
            tone="emerald"
            icon={CheckCircle2}
            label="Add-on aktif"
            value={String(activeAddOns)}
            sub={`${addOns.length - activeAddOns} nonaktif`}
          />
          <AdminMetricCard
            tone="neutral"
            icon={LayoutGrid}
            label="Total add-on"
            value={String(addOns.length)}
            sub="Seluruh katalog"
          />
          <AdminMetricCard
            tone="sky"
            icon={HardDrive}
            label="Add-on storage"
            value={String(storageAddOns)}
            sub="Menambah kuota penyimpanan"
          />
          <AdminMetricCard
            tone="amber"
            icon={Wallet}
            label="Harga rata-rata"
            value={formatIDR(averagePrice)}
            sub="Per bulan"
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Buat Add-on Baru</CardTitle>
          <CardDescription>
            Contoh: +1 sesi konkuren Rp49.000/bln, unit &quot;session&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminActionForm
            action={createAddOnAction}
            submitLabel="Buat Add-on"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor="addon-code" className="text-xs font-medium text-muted-foreground">
                Kode
              </Label>
              <Input id="addon-code" name="code" placeholder="extra-session" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="addon-name" className="text-xs font-medium text-muted-foreground">
                Nama
              </Label>
              <Input id="addon-name" name="name" placeholder="Add-on +1 Sesi" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="addon-price" className="text-xs font-medium text-muted-foreground">
                Harga / bln (IDR)
              </Label>
              <Input id="addon-price" name="price_monthly" type="number" defaultValue={49000} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="addon-unit" className="text-xs font-medium text-muted-foreground">
                Unit
              </Label>
              <Input id="addon-unit" name="unit" defaultValue="session" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="addon-storage" className="text-xs font-medium text-muted-foreground">
                Storage (MB)
              </Label>
              <Input
                id="addon-storage"
                name="storage_mb"
                type="number"
                placeholder="kosong = bukan add-on storage"
              />
            </div>
          </AdminActionForm>
        </CardContent>
      </Card>

      <section aria-labelledby="admin-add-ons-list" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-add-ons-list"
          title="Katalog add-on"
          description={`${addOns.length} add-on terdaftar · ${activeAddOns} aktif.`}
        />

        {addOns.length === 0 ? (
          <AdminEmptyState heading="BELUM ADA ADD-ON" icon={Package}>
            Buat add-on pertama di atas, dipakai owner untuk menambah limit sesi konkuren.
          </AdminEmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {addOns.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle>
                    {storageAddOnDisplayName({
                      name: a.name,
                      unit: a.unit,
                      storageMb: a.storage_mb,
                    })}
                  </CardTitle>
                  <CardDescription>
                    {a.code.toUpperCase()} · unit {a.unit}
                    {a.storage_mb ? ` · +${a.storage_mb} MB` : ""}
                  </CardDescription>
                  <CardAction>
                    <span className="flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatIDR(a.price_monthly)}/bln
                      </span>
                      <AdminStatusBadge status={a.is_active ? "active" : "inactive"} />
                    </span>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <AdminDisclosure
                    key={`${a.id}:${a.name}:${a.price_monthly}:${a.unit}:${a.storage_mb ?? ""}:${a.is_active}`}
                    className="border-t pt-3"
                    triggerClassName="min-h-11 text-xs font-medium text-muted-foreground hover:text-foreground"
                    trigger={<span>Edit add-on</span>}
                  >
                    <AdminActionForm
                      action={updateAddOnAction}
                      hidden={{ addOnId: a.id }}
                      submitLabel="Simpan"
                      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
                    >
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`name-${a.id}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Nama
                        </Label>
                        <Input
                          id={`name-${a.id}`}
                          name="name"
                          defaultValue={storageAddOnDisplayName({
                            name: a.name,
                            unit: a.unit,
                            storageMb: a.storage_mb,
                          })}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`price-${a.id}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Harga / bln
                        </Label>
                        <Input
                          id={`price-${a.id}`}
                          name="price_monthly"
                          type="number"
                          defaultValue={a.price_monthly}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`unit-${a.id}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Unit
                        </Label>
                        <Input id={`unit-${a.id}`} name="unit" defaultValue={a.unit} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`storage-${a.id}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Storage (MB)
                        </Label>
                        <Input
                          id={`storage-${a.id}`}
                          name="storage_mb"
                          type="number"
                          defaultValue={a.storage_mb ?? ""}
                        />
                      </div>
                      <AdminCheckbox name="is_active" label="Aktif" defaultChecked={a.is_active} />
                    </AdminActionForm>
                  </AdminDisclosure>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
