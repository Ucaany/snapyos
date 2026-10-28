"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { FormState } from "@/server/auth-actions";

/**
 * Formulir aksi admin generik - useActionState + hidden fields + error inline.
 * Anak form (input) dirender server-side dari halaman (docs/11 §11.5 form).
 *
 * Aksi berisiko memakai ConfirmDialog, bukan dialog native: dialog bisa
 * menyebut nama entitas dan konsekuensinya, dan tetap bisa ditutup dengan Esc.
 */
export function AdminActionForm({
  action,
  hidden = {},
  submitLabel,
  pendingLabel,
  variant = "default",
  size = "sm",
  confirm,
  confirmTitle = "Konfirmasi tindakan",
  className,
  submitClassName,
  children,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  hidden?: Record<string, string>;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "default" | "secondary" | "outline" | "destructive" | "ghost";
  size?: "default" | "sm" | "lg" | "icon" | "icon-sm";
  confirm?: string;
  confirmTitle?: string;
  className?: string;
  submitClassName?: string;
  children?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={(event) => {
          if (!confirm || confirmedRef.current) return;
          event.preventDefault();
          setConfirmOpen(true);
        }}
        className={className ?? "flex flex-col gap-2"}
        noValidate
      >
        {Object.entries(hidden).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        {children}
        {state.error ? (
          <p role="alert" className="font-mono text-xs text-destructive">
            {state.error}
          </p>
        ) : null}
        {Object.entries(state.fieldErrors ?? {}).map(([field, errors]) =>
          errors?.[0] ? (
            <p key={field} role="alert" className="font-mono text-xs text-destructive">
              {errors[0]}
            </p>
          ) : null
        )}
        <SubmitButton
          label={submitLabel}
          pendingLabel={pendingLabel}
          variant={variant}
          size={size}
          className={submitClassName}
        />
      </form>
      {confirm ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={confirmTitle}
          description={confirm}
          confirmLabel={submitLabel}
          variant={variant === "destructive" ? "destructive" : "default"}
          onConfirm={() => {
            confirmedRef.current = true;
            setConfirmOpen(false);
            formRef.current?.requestSubmit();
          }}
        />
      ) : null}
    </>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  variant,
  size,
  className,
}: {
  label: string;
  pendingLabel?: string;
  variant: "default" | "secondary" | "outline" | "destructive" | "ghost";
  size: "default" | "sm" | "lg" | "icon" | "icon-sm";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      className={cn("w-fit", className)}
    >
      {pending ? (pendingLabel ?? "Memproses…") : label}
    </Button>
  );
}

/** Aksi satu-klik (suspend/reactivate/role/cancel/toggle) tanpa input tambahan. */
export function AdminActionButton(
  props: Omit<Parameters<typeof AdminActionForm>[0], "children" | "submitLabel"> & {
    submitLabel: string;
  }
) {
  return <AdminActionForm {...props} />;
}
