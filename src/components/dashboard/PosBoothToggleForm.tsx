"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Power, PowerOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { posToggleBoothAction } from "@/server/pos-actions";
import type { FormState } from "@/server/auth-actions";

const initialState: FormState = {};

export function PosBoothToggleForm({
  photoboxId,
  boothName,
  enabled,
  disabled,
}: {
  photoboxId: string;
  boothName: string;
  enabled: boolean;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState(posToggleBoothAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="photoboxId" value={photoboxId} />
      <input type="hidden" name="enabled" value={String(enabled)} />
      <SubmitButton boothName={boothName} enabled={enabled} disabled={disabled} />
      {state.error ? (
        <p
          role="alert"
          className="max-w-56 text-right font-mono text-[10px] uppercase text-destructive"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function SubmitButton({
  boothName,
  enabled,
  disabled,
}: {
  boothName: string;
  enabled: boolean;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  const label = enabled ? "Aktifkan POS" : "Nonaktifkan";

  return (
    <Button
      type="submit"
      variant={enabled ? "default" : "outline"}
      size="sm"
      disabled={disabled || pending}
      title={disabled ? "Nonaktifkan booth aktif dulu untuk memindahkan POS" : undefined}
      aria-label={`${label} di booth ${boothName}`}
    >
      {pending ? (
        "Memproses…"
      ) : enabled ? (
        <>
          <Power aria-hidden /> {label}
        </>
      ) : (
        <>
          <PowerOff aria-hidden /> {label}
        </>
      )}
    </Button>
  );
}
