"use client";

import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { FormState } from "@/server/auth-actions";

/** Aksi boleh mengembalikan FormState (berisi pesan error) atau void. */
type ServerAction = (formData: FormData) => Promise<FormState | void> | FormState | void;

type Props = {
  /** Server action yang menerima FormData; FormState-nya dibaca untuk pesan error. */
  action: ServerAction;
  /** ID entity yang akan dihapus/dinonaktifkan (dikirim sebagai field `id`). */
  id: string;
  /** Judul dialog konfirmasi. */
  title: string;
  /** Deskripsi konsekuensi aksi. */
  description: string;
  /** Label tombol utama di dialog (default "Hapus permanen"). */
  confirmLabel?: string;
  /** Varian dialog: destructive (merah) untuk delete, default untuk deactivate. */
  variant?: "default" | "destructive";
  /** Nonaktifkan trigger (mis. entity punya dependency aktif). */
  disabled?: boolean;
  /** Custom label untuk trigger button (sr-only default: "Hapus"). */
  triggerLabel?: string;
  /** Icon custom untuk trigger button. Default: Trash2. */
  triggerIcon?: ReactNode;
  /** Tooltip untuk trigger button. */
  triggerTitle?: string;
  /** Field tambahan yang harus ikut dikirim (mis. user_id, business_id). */
  extraFields?: Record<string, string>;
  /** Tombol trigger ringkas 36px (hit area tetap 44px) untuk tabel padat. */
  compact?: boolean;
};

/**
 * Tombol destructive terbungkus ConfirmDialog.
 * Trigger `<button type="button">` membuka dialog; action hanya dipanggil
 * setelah user mengonfirmasi, dan pesan error-nya ditampilkan di dialog.
 */
export function DeleteConfirmForm({
  action,
  id,
  title,
  description,
  confirmLabel = "Hapus permanen",
  variant = "destructive",
  disabled,
  triggerLabel = "Hapus",
  triggerIcon,
  triggerTitle,
  extraFields,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);

  // Bangun FormData yang sama seperti submit form, lalu panggil action
  // langsung, hasilnya (FormState) bisa diperiksa sebelum dialog ditutup.
  function collectFormData(): FormData {
    const fd = new FormData();
    fd.set("id", id);
    if (extraFields) {
      for (const [key, value] of Object.entries(extraFields)) fd.set(key, value);
    }
    return fd;
  }

  return (
    <>
      <form className="inline-flex">
        <Button
          type="button"
          variant={variant === "destructive" ? "destructive" : "neutral"}
          size={compact ? "icon-xs" : "icon"}
          disabled={disabled}
          onClick={() => setOpen(true)}
          title={triggerTitle ?? triggerLabel}
          aria-label={triggerLabel}
        >
          {triggerIcon ?? <Trash2 className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </form>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        variant={variant}
        onConfirm={async () => {
          // Panggil action langsung agar bisa membaca FormState hasilnya.
          const state = await action(collectFormData());
          if (state?.error) return state.error;
          if (state?.fieldErrors) {
            const first = Object.values(state.fieldErrors)[0]?.[0];
            if (first) return first;
          }
          return undefined;
        }}
      />
    </>
  );
}
