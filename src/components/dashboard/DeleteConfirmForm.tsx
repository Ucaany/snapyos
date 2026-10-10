"use client";

import { useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type ServerAction = (formData: FormData) => Promise<void> | void;

type Props = {
  /** Server action (fire-and-forget) yang menerima FormData. */
  action: ServerAction;
  /** ID entity yang akan dihapus/dinonaktifkan (hidden input `name="id"`). */
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
};

/**
 * Tombol destructive terbungkus ConfirmDialog + form server action.
 * Trigger `<button type="button">` membuka dialog; form submit hanya terjadi setelah konfirmasi.
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
}: Props) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={action} className="inline-flex">
        <input type="hidden" name="id" value={id} />
        {extraFields &&
          Object.entries(extraFields).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        <Button
          type="button"
          variant={variant === "destructive" ? "destructive" : "secondary"}
          size="icon"
          disabled={disabled}
          onClick={() => setOpen(true)}
          title={triggerTitle ?? triggerLabel}
          aria-label={triggerLabel}
          className="relative after:absolute after:-inset-1.5"
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
        onConfirm={() => {
          formRef.current?.requestSubmit();
        }}
      />
    </>
  );
}
