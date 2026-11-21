import Link from "next/link";
import { ChevronDown, Gem, ImageIcon, LayoutGrid, Pencil, Wallet } from "lucide-react";

import { AdminActionButton, AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminRecordCard } from "@/components/admin/AdminRecordCard";
import { AdminRecordCollection } from "@/components/admin/AdminRecordCollection";
import { AdminSectionHeading } from "@/components/admin/AdminSectionHeading";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminCheckbox } from "@/components/admin/AdminCheckbox";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Badge } from "@/components/admin/ui/badge";
import { buttonVariants } from "@/components/admin/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/admin/ui/collapsible";
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/admin/ui/table";
import { formatIDR } from "@/lib/dashboard-math";
import { listGlobalTemplates, listTemplateCategories, listTemplatePurchases } from "@/server/admin";
import {
  createCategoryAction,
  createGlobalTemplateAction,
  deleteCategoryAction,
  deleteGlobalTemplateAction,
  toggleTemplateAction,
  updateGlobalTemplateAction,
} from "@/server/admin-actions";

/**
 * Admin templates & kategori global - docs/10 §10.2 (migration 0039).
 * Template global = templates dengan business_id NULL (docs/07 §7.3).
 */
export default async function AdminTemplatesPage() {
  const [categories, templates, purchases] = await Promise.all([
    listTemplateCategories(),
    listGlobalTemplates(),
    listTemplatePurchases(),
  ]);

  const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));
  const activeTemplates = templates.filter((template) => template.is_active).length;
  const premiumTemplates = templates.filter((template) => template.is_premium).length;
  const templateRevenue = purchases.reduce((total, purchase) => total + purchase.price, 0);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={ImageIcon}
        title="Template Global"
        meta={`${categories.length} kategori · ${templates.length} template global`}
      />

      <section aria-labelledby="admin-templates-metrics" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-templates-metrics"
          title="Ikhtisar"
          description="Katalog frame platform dan pembelian template premium tenant."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            accent
            tone="sky"
            icon={ImageIcon}
            label="Template global"
            value={String(templates.length)}
            sub={`${activeTemplates} aktif`}
          />
          <AdminMetricCard
            tone="neutral"
            icon={LayoutGrid}
            label="Kategori"
            value={String(categories.length)}
            sub="Dipakai seluruh tenant"
          />
          <AdminMetricCard
            tone="emerald"
            icon={Gem}
            label="Template premium"
            value={String(premiumTemplates)}
            sub="Berbayar"
          />
          <AdminMetricCard
            tone="emerald"
            icon={Wallet}
            label="Pembelian premium"
            value={String(purchases.length)}
            sub={`${formatIDR(templateRevenue)} nilai tercatat`}
          />
        </div>
      </section>

      <section aria-labelledby="admin-templates-categories" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-templates-categories"
          title="Kategori template"
          description="Kategori global dipakai seluruh tenant dan template platform."
        />

        <Card>
          <CardHeader>
            <CardTitle>Tambah kategori</CardTitle>
            <CardDescription>
              Kategori global dipakai seluruh tenant + template global (FK{" "}
              <code className="text-xs">templates.category_id</code>).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <AdminActionForm
              action={createCategoryAction}
              submitLabel="Buat Kategori"
              className="flex flex-wrap items-end gap-2"
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor="cat-name" className="text-xs text-muted-foreground">
                  Nama kategori
                </Label>
                <Input
                  id="cat-name"
                  name="name"
                  placeholder="cth. Wedding"
                  className="w-full sm:w-56"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cat-price" className="text-xs text-muted-foreground">
                  Harga default (IDR, opsional)
                </Label>
                <Input
                  id="cat-price"
                  name="price"
                  type="number"
                  min={0}
                  placeholder="Kosong = gratis"
                  className="w-full sm:w-44"
                />
              </div>
            </AdminActionForm>

            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada kategori global.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-xs"
                  >
                    <span>
                      {c.name}
                      {c.price !== null ? (
                        <span className="ml-2 font-medium text-foreground">
                          {formatIDR(c.price)}
                        </span>
                      ) : null}
                    </span>
                    <AdminActionButton
                      action={deleteCategoryAction}
                      hidden={{ categoryId: c.id }}
                      submitLabel="Hapus kategori"
                      variant="destructive"
                      confirm={`Hapus kategori "${c.name}"? Ditolak bila masih dipakai template.`}
                      confirmTitle={`Hapus kategori ${c.name}`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="admin-templates-global" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-templates-global"
          title="Template global"
          description="Upload frame platform dan kelola katalog yang tampil ke tenant."
        />

        <Card>
          <CardHeader>
            <CardTitle>Upload template</CardTitle>
            <CardDescription>
              Isi URL storage frame (mis. hasil upload manual ke bucket / CDN publik). Owner tetap
              dapat mengupload frame mereka sendiri dari dashboard Templates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Buat kategori dulu sebelum upload template.
              </p>
            ) : (
              <AdminActionForm
                action={createGlobalTemplateAction}
                submitLabel="Simpan Template"
                className="grid grid-cols-1 gap-4 md:grid-cols-2"
              >
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tpl-name" className="text-xs text-muted-foreground">
                    Nama template
                  </Label>
                  <Input id="tpl-name" name="name" placeholder="cth. Frame Wedding Emas" required />
                </div>
                <AdminSelect
                  name="category_id"
                  label="Kategori"
                  defaultValue={categoryOptions[0]?.value ?? ""}
                  options={categoryOptions}
                  required
                />
                <div className="flex flex-col gap-1 md:col-span-2">
                  <Label htmlFor="tpl-file" className="text-xs text-muted-foreground">
                    Upload file frame (PNG/JPG/WebP), atau isi URL di bawah
                  </Label>
                  <Input
                    id="tpl-file"
                    name="file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                  />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <Label htmlFor="tpl-file-url" className="text-xs text-muted-foreground">
                    URL file frame (opsional bila upload file)
                  </Label>
                  <Input
                    id="tpl-file-url"
                    name="file_url"
                    placeholder="https://cdn.snapyos.biz.id/templates/frame-wedding.png"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tpl-thumb" className="text-xs text-muted-foreground">
                    URL thumbnail (opsional)
                  </Label>
                  <Input
                    id="tpl-thumb"
                    name="thumbnail_url"
                    placeholder="https://cdn.snapyos.biz.id/templates/thumb.jpg"
                    aria-describedby="tpl-thumb-help"
                  />
                  <p id="tpl-thumb-help" className="text-xs leading-snug text-muted-foreground">
                    Wajib URL/key storage SnapyOS (Supabase/R2), bukan domain eksternal.
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tpl-price" className="text-xs text-muted-foreground">
                    Harga (IDR, opsional)
                  </Label>
                  <Input
                    id="tpl-price"
                    name="price"
                    type="number"
                    min={0}
                    placeholder="Kosong = gratis"
                  />
                </div>
                <AdminCheckbox
                  name="is_premium"
                  label="Template premium (berbayar)"
                  description="Tandai agar template hanya bisa dipakai tenant yang membayar."
                  defaultChecked={false}
                  wrapperClassName="md:col-span-2"
                />
                <AdminCheckbox
                  name="is_active"
                  label="Aktif segera"
                  description="Non-aktifkan bila masih dalam review / staging."
                  defaultChecked
                  wrapperClassName="md:col-span-2"
                />
              </AdminActionForm>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Katalog template</CardTitle>
            <CardDescription>
              Frame platform yang bisa dipakai semua tenant. Admin dapat toggle aktif/non-aktif.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {templates.length === 0 ? (
              <AdminEmptyState heading="Belum ada template global" icon={ImageIcon}>
                Upload template pertama lewat form &quot;Upload template&quot; di atas.
              </AdminEmptyState>
            ) : (
              <ul className="flex flex-col">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-t py-3 first:border-t-0"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {t.name}
                        {t.is_premium ? (
                          <Badge className="ml-2" variant="secondary">
                            Premium
                          </Badge>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t.category_name ?? "Tanpa kategori"} ·{" "}
                        {dateFmt.format(new Date(t.created_at))}
                        {t.price !== null ? ` · ${formatIDR(t.price)}` : " · Gratis"}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <AdminStatusBadge status={t.is_active ? "active" : "inactive"} />
                      <Link
                        href={`/admin/templates/builder/${t.id}`}
                        aria-label={`Atur slot template ${t.name}`}
                        title="Atur slot"
                        className={buttonVariants({ variant: "outline", size: "icon" })}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Link>
                      <AdminActionButton
                        action={toggleTemplateAction}
                        hidden={{ templateId: t.id, active: t.is_active ? "false" : "true" }}
                        submitLabel={t.is_active ? "Nonaktifkan" : "Aktifkan"}
                        icon={t.is_active ? "eyeOff" : "eye"}
                        iconOnly
                        variant="neutral"
                      />
                      <AdminActionButton
                        action={deleteGlobalTemplateAction}
                        hidden={{ templateId: t.id }}
                        submitLabel="Hapus template"
                        icon="trash"
                        iconOnly
                        variant="destructive"
                        confirm={`Hapus template "${t.name}"? Riwayat pembelian tenant untuk template ini ikut terhapus.`}
                        confirmTitle={`Hapus template ${t.name}`}
                      />
                    </span>
                    <Collapsible className="w-full border-t pt-3">
                      <CollapsibleTrigger className="group flex min-h-9 w-full items-center gap-2 text-xs font-medium">
                        Edit harga / premium
                        <ChevronDown className="size-3.5 transition-transform group-aria-expanded:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <AdminActionForm
                          action={updateGlobalTemplateAction}
                          hidden={{ templateId: t.id }}
                          submitLabel="Simpan"
                          className="mt-3 flex flex-wrap items-end gap-3"
                        >
                          <div className="flex flex-col gap-1">
                            <Label
                              htmlFor={`edit-name-${t.id}`}
                              className="text-xs text-muted-foreground"
                            >
                              Nama
                            </Label>
                            <Input
                              id={`edit-name-${t.id}`}
                              name="name"
                              defaultValue={t.name}
                              className="w-full sm:w-52"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label
                              htmlFor={`edit-price-${t.id}`}
                              className="text-xs text-muted-foreground"
                            >
                              Harga (IDR)
                            </Label>
                            <Input
                              id={`edit-price-${t.id}`}
                              name="price"
                              type="number"
                              min={0}
                              defaultValue={t.price ?? ""}
                              placeholder="Kosong = gratis"
                              className="w-full sm:w-40"
                            />
                          </div>
                          <AdminCheckbox
                            name="is_premium"
                            label="Premium"
                            defaultChecked={t.is_premium}
                          />
                          <AdminCheckbox
                            name="is_active"
                            label="Aktif"
                            defaultChecked={t.is_active}
                          />
                        </AdminActionForm>
                      </CollapsibleContent>
                    </Collapsible>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <AdminRecordCollection
        storageKey="snapyos.view.admin.template-purchases"
        label="Riwayat pembelian template"
        title="Riwayat pembelian template"
        description="Pembelian template premium oleh tenant (diproses saat invoice QRIS lunas)."
        empty={
          purchases.length === 0 ? (
            <AdminEmptyState heading="Belum ada pembelian">
              Belum ada tenant yang membeli template premium. Pembelian tercatat di sini setelah
              invoice QRIS lunas.
            </AdminEmptyState>
          ) : undefined
        }
        list={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Harga</TableHead>
                <TableHead className="hidden sm:table-cell">Dibeli</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.business_name}</TableCell>
                  <TableCell>{p.template_name}</TableCell>
                  <TableCell className="font-medium">{formatIDR(p.price)}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {dateFmt.format(new Date(p.created_at))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
        grid={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {purchases.map((p) => (
              <AdminRecordCard
                key={p.id}
                title={p.template_name}
                subtitle={p.business_name}
                meta={[
                  { label: "Harga", value: formatIDR(p.price) },
                  { label: "Dibeli", value: dateFmt.format(new Date(p.created_at)) },
                ]}
              />
            ))}
          </div>
        }
      />
    </div>
  );
}
