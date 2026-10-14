"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ImageIcon, LayoutTemplate, Pencil, Upload } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { DeleteConfirmForm } from "@/components/dashboard/DeleteConfirmForm";
import { TemplateEditForm } from "@/components/dashboard/TemplateEditForm";
import { LABEL_CLASS as labelClass, fieldError } from "@/lib/form-ui";
import type { TemplateRow } from "@/server/templates";
import { TEMPLATE_CATEGORIES } from "@/lib/validators";
import type { FormState } from "@/server/auth-actions";
import {
  deleteTemplateAction,
  uploadTemplateAction,
} from "@/server/catalog-actions";

const initial: FormState = {};

type Props = {
  templates: TemplateRow[];
  canWrite: boolean;
};

/** TemplatesGrid — upload & kelola frame (docs/04 §4.10, §4.10.1 MVP). */
export function TemplatesGrid({ templates, canWrite }: Props) {
  const [uploadState, uploadAction, uploading] = useActionState(uploadTemplateAction, initial);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {canWrite && (
        <form
          action={uploadAction}
          className="flex flex-col gap-6 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111] md:p-6"
          noValidate
        >
          <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
            {"/// Upload frame baru"}
          </p>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="tpl-name" className={labelClass}>
                Nama template *
              </label>
              <Input
                id="tpl-name"
                name="name"
                required
                placeholder="cth. Frame Y2K Pink"
                disabled={uploading}
                aria-invalid={Boolean(fieldError(uploadState, "name"))}
              />
              {fieldError(uploadState, "name") && (
                <p role="alert" className="font-mono text-xs text-destructive">
                  {fieldError(uploadState, "name")}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="tpl-category" className={labelClass}>
                Kategori *
              </label>
              <Select id="tpl-category" name="category" defaultValue="custom" disabled={uploading}>
                {TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.toUpperCase()}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="tpl-file" className={labelClass}>
                File frame (PNG/JPG/WebP, maks 5 MB) *
              </label>
              <input
                id="tpl-file"
                name="file"
                type="file"
                required
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                aria-invalid={Boolean(fieldError(uploadState, "file"))}
                className="h-11 w-full border-2 border-ink bg-surface px-3 py-2.5 font-mono text-xs shadow-[2px_2px_0_0_#111111] file:mr-3 file:border-2 file:border-ink file:bg-accent file:px-2 file:py-1 file:font-mono file:text-[10px] file:font-bold file:uppercase"
              />
              {fieldError(uploadState, "file") && (
                <p role="alert" className="font-mono text-xs text-destructive">
                  {fieldError(uploadState, "file")}
                </p>
              )}
            </div>
          </div>
          {uploadState.error && (
            <p role="alert" className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink">
              {uploadState.error}
            </p>
          )}
          <div className="flex justify-end border-t-2 border-ink/10 pt-4">
            <Button type="submit" size="sm" disabled={uploading}>
              <Upload aria-hidden />
              {uploading ? "Mengunggah\u2026" : "Upload frame"}
            </Button>
          </div>
        </form>
      )}

      {templates.length === 0 ? (
        canWrite ? (
          <EmptyState
            icon={ImageIcon}
            eyebrow="BELUM ADA TEMPLATE"
            title="Desain frame di Canva/Figma/Photoshop, ekspor PNG transparan, lalu unggah di sini."
            body="Assign ke paket agar bisa dipilih customer."
          />
        ) : (
          <EmptyState
            icon={ImageIcon}
            eyebrow="BELUM ADA TEMPLATE"
            title="Belum ada frame yang tersedia untuk Anda."
            body="Minta owner mengunggah frame dan meng-assign-nya ke paket booth Anda, lalu muat ulang halaman."
          />
        )
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3" aria-label="Daftar template">
          {templates.map((tpl) => (
            <li key={tpl.id} className="flex flex-col border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
              <div className="flex h-44 items-center justify-center overflow-hidden border-b-2 border-ink bg-[repeating-linear-gradient(45deg,#FFFDF5_0_10px,#F4F4F0_10px_20px)]">
                {tpl.preview_url ? (
                  <Image
                    src={tpl.preview_url}
                    alt={`Preview template ${tpl.name}`}
                    width={480}
                    height={320}
                    className="max-h-full max-w-full object-contain p-3"
                    loading="lazy"
                    unoptimized
                  />
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    PREVIEW TIDAK TERSEDIA
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold uppercase tracking-[0.05em]">{tpl.name}</p>
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                      {`${tpl.category} \u00b7 ${tpl.created_at.slice(0, 10)} \u00b7 ${
                        tpl.file_url.endsWith(".png") ? "PNG" : "FRAME"
                      }`}
                    </p>
                  </div>
                  <StatusBadge status={tpl.is_active ? "active" : "inactive"} />
                </div>

                {editingId === tpl.id && canWrite ? (
                  <TemplateEditForm template={tpl} onDone={() => setEditingId(null)} />
                ) : (
                  canWrite && (
                    <div className="mt-auto flex items-center justify-between gap-2 border-t-2 border-ink/10 pt-3">
                      <Link
                        href={`/dashboard/templates/builder/${tpl.id}`}
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                        aria-label={`Buka builder slot ${tpl.name}`}
                      >
                        <LayoutTemplate aria-hidden />
                        Atur slot
                      </Link>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label={`Ubah template ${tpl.name}`}
                          aria-expanded={editingId === tpl.id}
                          onClick={() => setEditingId(editingId === tpl.id ? null : tpl.id)}
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <DeleteConfirmForm
                          action={deleteTemplateAction}
                          id={tpl.id}
                          title="Hapus template?"
                          description={`Template ${tpl.name} akan dihapus permanen. Paket yang memakai template ini akan kehilangan opsi frame.`}
                          triggerLabel={`Hapus template ${tpl.name}`}
                        />
                      </div>
                    </div>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
