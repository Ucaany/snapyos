"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Ban,
  Check,
  CircleCheck,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  ShieldOff,
  Trash2,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { FormState } from "@/server/auth-actions";

export type ActionIconName =
  | "ban"
  | "check"
  | "circleCheck"
  | "eye"
  | "eyeOff"
  | "plus"
  | "rotateCcw"
  | "send"
  | "shieldCheck"
  | "shieldOff"
  | "trash"
  | "xCircle";

/**
 * Ikon aksi dikirim sebagai NAMA, bukan komponen. Halaman admin adalah Server
 * Component; fungsi komponen tidak bisa menyeberang ke Client Component
 * (`AdminActionForm`). Glyph ini yang menjembatani keduanya.
 */
function ActionGlyph({ name }: { name: ActionIconName }) {
  const className = "size-4";
  switch (name) {
    case "ban":
      return <Ban className={className} aria-hidden="true" />;
    case "check":
      return <Check className={className} aria-hidden="true" />;
    case "circleCheck":
      return <CircleCheck className={className} aria-hidden="true" />;
    case "eye":
      return <Eye className={className} aria-hidden="true" />;
    case "eyeOff":
      return <EyeOff className={className} aria-hidden="true" />;
    case "plus":
      return <Plus className={className} aria-hidden="true" />;
    case "rotateCcw":
      return <RotateCcw className={className} aria-hidden="true" />;
    case "send":
      return <Send className={className} aria-hidden="true" />;
    case "shieldCheck":
      return <ShieldCheck className={className} aria-hidden="true" />;
    case "shieldOff":
      return <ShieldOff className={className} aria-hidden="true" />;
    case "trash":
      return <Trash2 className={className} aria-hidden="true" />;
    case "xCircle":
      return <XCircle className={className} aria-hidden="true" />;
  }
}

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
  icon,
  iconOnly = false,
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
  icon?: ActionIconName;
  iconOnly?: boolean;
  children?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const compact = iconOnly && icon != null;

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
        className={className ?? (compact ? "flex" : "flex flex-col gap-2")}
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
          size={compact ? "icon" : size}
          className={submitClassName}
          icon={icon}
          iconOnly={compact}
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
  icon,
  iconOnly,
}: {
  label: string;
  pendingLabel?: string;
  variant: "default" | "secondary" | "outline" | "destructive" | "ghost";
  size: "default" | "sm" | "lg" | "icon" | "icon-sm";
  className?: string;
  icon?: ActionIconName;
  iconOnly?: boolean;
}) {
  const { pending } = useFormStatus();

  if (iconOnly) {
    return (
      <Button
        type="submit"
        variant={variant}
        size="icon"
        disabled={pending}
        aria-label={label}
        title={label}
        className={cn(className)}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : icon ? (
          <ActionGlyph name={icon} />
        ) : (
          <span className="sr-only">{label}</span>
        )}
      </Button>
    );
  }

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      className={cn("w-fit", className)}
    >
      {icon ? <ActionGlyph name={icon} /> : null}
      {pending ? (pendingLabel ?? "Memproses...") : label}
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
