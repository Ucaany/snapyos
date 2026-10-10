import Link from "next/link";
import { AdminActionButton, AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { BrutalistCheckbox } from "@/components/admin/BrutalistCheckbox";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatIDR } from "@/lib/dashboard-math";
import {
  createCategoryAction,
  createGlobalTemplateAction,
  deleteCategoryAction,
  toggleTemplateAction,
  updateGlobalTemplateAction,
} from "@/server/admin-actions";
import { listGlobalTemplates, listTemplateCategories, listTemplatePurchases } from "@/server/admin";

/**
 * Admin templates & kategori global - docs/10 §10.2 (migration 0039).
 * Template global = templates dengan business_id NULL (docs/07 §7.3).
 *
 * K4 (audit 2026-09-16): tambahkan form upload template global (URL file frame
 * + kategori FK). Owner tetap upload lewat dashboardnya sendiri (upload PNG
 * chroma-key via builder); admin memasang template referensi platform.
 */
export default async function AdminTemplatesPage() {
  const [categories, templates, purchases] = await Promise.all([
    listTemplateCategories(),
    listGlobalTemplates(),
    listTemplatePurchases(),
  ]);

  const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name.toUpperCase() }));

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {"/// ADMIN - TEMPLATES & CATEGORIES"}
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-tight md:text-4xl">
          Template Global
        </h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {categories.length} KATEGORI · {templates.length} TEMPLATE GLOBAL
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Kategori Template</CardTitle>
          <CardDescription>
            Kategori global dipakai seluruh tenant + template global (FK
            <code className="ml-1 font-mono text-[10px]">templates.category_id</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AdminActionForm
            action={createCategoryAction}
            submitLabel="Buat Kategori"
            className="flex flex-wrap items-end gap-2"
          >
            <div className="flex flex-col gap-1">
              <label
                htmlFor="cat-name"
                className="font-mono text-[10px] uppercase tracking-[0.12em]"
              >
                Nama kategori
              </label>
              <Input id="cat-name" name="name" placeholder="cth. Wedding" className="w-56" />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="cat-price"
                className="font-mono text-[10px] uppercase tracking-[0.12em]"
              >
                Harga default (IDR, opsional)
              </label>
              <Input id="cat-price" name="price" type="number" min={0} placeholder="Kosong = gratis" className="w-44" />
            </div>
          </AdminActionForm>

          {categories.length === 0 ? (
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
              {"/// BELUM ADA KATEGORI GLOBAL"}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 border-2 border-ink bg-muted/60 px-3 py-2 font-mono text-xs uppercase"
                >
                  <span>
                    {c.name}
                    {c.price !== null ? (
                      <span className="ml-2 font-bold text-ink">{formatIDR(c.price)}</span>
                    ) : null}
                  </span>
                  <AdminActionButton
                    action={deleteCategoryAction}
                    hidden={{ categoryId: c.id }}
                    submitLabel="Hapus"
                    variant="ghost"
                    confirm={`Hapus kategori "${c.name}"? Ditolak bila masih dipakai template.`}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload Template Global Baru</CardTitle>
          <CardDescription>
            Isi URL storage frame (mis. hasil upload manual ke bucket / CDN publik). Owner tetap
            dapat mengupload frame mereka sendiri dari dashboard Templates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
              {"/// BUAT KATEGORI DULU SEBELUM UPLOAD TEMPLATE"}
            </p>
          ) : (
            <AdminActionForm
              action={createGlobalTemplateAction}
              submitLabel="Simpan Template"
              className="grid grid-cols-1 gap-4 md:grid-cols-2"
            >
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="tpl-name"
                  className="font-mono text-[10px] uppercase tracking-[0.12em]"
                >
                  Nama template
                </label>
                <Input id="tpl-name" name="name" placeholder="cth. Frame Wedding Emas" required />
              </div>
              <BrutalistSelect
                name="category_id"
                label="Kategori"
                defaultValue={categoryOptions[0]?.value ?? ""}
                options={categoryOptions}
                required
              />
              <div className="flex flex-col gap-1 md:col-span-2">
                <label
                  htmlFor="tpl-file"
                  className="font-mono text-[10px] uppercase tracking-[0.12em]"
                >
                  Upload file frame (PNG/JPG/WebP) - atau isi URL di bawah
                </label>
                <Input
                  id="tpl-file"
                  name="file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                />
              </div>
              <div className="flex flex-col gap-1 md:col-span-2">
                <label
                  htmlFor="tpl-file-url"
                  className="font-mono text-[10px] uppercase tracking-[0.12em]"
                >
                  URL file frame (opsional bila upload file)
                </label>
                <Input
                  id="tpl-file-url"
                  name="file_url"
                  placeholder="https://cdn.snapyos.biz.id/templates/frame-wedding.png"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="tpl-thumb"
                  className="font-mono text-[10px] uppercase tracking-[0.12em]"
                >
                  URL thumbnail (opsional)
                </label>
                <Input
                  id="tpl-thumb"
                  name="thumbnail_url"
                  placeholder="https://cdn.snapyos.biz.id/templates/thumb.jpg"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="tpl-price"
                  className="font-mono text-[10px] uppercase tracking-[0.12em]"
                >
                  Harga (IDR, opsional)
                </label>
                <Input
                  id="tpl-price"
                  name="price"
                  type="number"
                  min={0}
                  placeholder="Kosong = gratis"
                />
              </div>
              <BrutalistCheckbox
                name="is_premium"
                label="Template premium (berbayar)"
                description="Tandai agar template hanya bisa dipakai tenant yang membayar."
                defaultChecked={false}
                wrapperClassName="md:col-span-2"
              />
              <BrutalistCheckbox
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
          <CardTitle>Template Global</CardTitle>
          <CardDescription>
            Frame platform yang bisa dipakai semua tenant. Admin dapat toggle aktif/non-aktif.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <AdminEmptyState heading="/// BELUM ADA TEMPLATE GLOBAL">
              Upload template pertama lewat form &quot;Upload Template Global Baru&quot; di atas.
            </AdminEmptyState>
          ) : (
            <ul className="flex flex-col">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink/10 py-3 first:border-t-0"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">
                      {t.name}
                      {t.is_premium ? (
                        <span className="ml-2 inline-block border-2 border-ink bg-ink px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-bg">
                          PREMIUM
                        </span>
                      ) : null}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {t.category_name ?? "Tanpa kategori"} ·{" "}
                      {dateFmt.format(new Date(t.created_at))}
                      {t.price !== null ? ` · ${formatIDR(t.price)}` : " · GRATIS"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusBadge status={t.is_active ? "active" : "inactive"} />
                    <Link
                      href={`/admin/templates/builder/${t.id}`}
                      className="border-2 border-ink bg-surface px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.08em] shadow-[2px_2px_0_0_#111111] active:translate-y-[2px]"
                    >
                      Edit slot
                    </Link>
                    <AdminActionButton
                      action={toggleTemplateAction}
                      hidden={{ templateId: t.id, active: t.is_active ? "false" : "true" }}
                      submitLabel={t.is_active ? "Nonaktifkan" : "Aktifkan"}
                      variant={t.is_active ? "outline" : "secondary"}
                    />
                  </span>
                  <details className="w-full border-t-2 border-ink/10 pt-3">
                    <summary className="cursor-pointer font-mono text-xs uppercase tracking-[0.12em]">
                      Edit harga / premium
                    </summary>
                    <AdminActionForm
                      action={updateGlobalTemplateAction}
                      hidden={{ templateId: t.id }}
                      submitLabel="Simpan"
                      className="mt-3 flex flex-wrap items-end gap-3"
                    >
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`edit-name-${t.id}`}
                          className="font-mono text-[10px] uppercase tracking-[0.12em]"
                        >
                          Nama
                        </label>
                        <Input id={`edit-name-${t.id}`} name="name" defaultValue={t.name} className="w-52" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`edit-price-${t.id}`}
                          className="font-mono text-[10px] uppercase tracking-[0.12em]"
                        >
                          Harga (IDR)
                        </label>
                        <Input
                          id={`edit-price-${t.id}`}
                          name="price"
                          type="number"
                          min={0}
                          defaultValue={t.price ?? ""}
                          placeholder="Kosong = gratis"
                          className="w-40"
                        />
                      </div>
                      <BrutalistCheckbox
                        name="is_premium"
                        label="Premium"
                        defaultChecked={t.is_premium}
                      />
                      <BrutalistCheckbox
                        name="is_active"
                        label="Aktif"
                        defaultChecked={t.is_active}
                      />
                    </AdminActionForm>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Pembelian Template</CardTitle>
          <CardDescription>
            Pembelian template premium oleh tenant (diproses saat invoice QRIS lunas).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {purchases.length === 0 ? (
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
              {"/// BELUM ADA PEMBELIAN TEMPLATE PREMIUM"}
            </p>
          ) : (
            <div className="overflow-x-auto border-2 border-ink">
              <table className="w-full min-w-[640px] border-collapse bg-surface text-left">
                <thead>
                  <tr className="bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                    <th className="px-4 py-3 font-bold">Business</th>
                    <th className="px-4 py-3 font-bold">Template</th>
                    <th className="px-4 py-3 font-bold">Harga</th>
                    <th className="px-4 py-3 font-bold">Dibeli</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id} className="border-t-2 border-ink/10">
                      <td className="px-4 py-3 text-sm font-bold">{p.business_name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{p.template_name}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold">{formatIDR(p.price)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {dateFmt.format(new Date(p.created_at))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
