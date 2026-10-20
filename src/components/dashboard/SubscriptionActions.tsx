"use client";

import { useActionState } from "react";
import { Loader2, Minus, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FormState } from "@/server/auth-actions";
import {
  cancelAddOnAction,
  cancelSubscriptionAction,
  resumeSubscriptionAction,
} from "@/server/subscription-actions";

const initial: FormState = {};

/** Error inline brutalist — aksi subscription (cancel/resume/add-on). */
function InlineError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="border-2 border-destructive bg-destructive/10 px-2 py-1 font-mono text-[11px] leading-tight text-ink"
    >
      {message}
    </p>
  );
}

/** Tombol "Batalkan di akhir periode" — form + error inline. */
export function CancelSubscriptionForm() {
  const [state, action, pending] = useActionState(cancelSubscriptionAction, initial);
  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <X className="size-4" aria-hidden />
          )}
          Batalkan di akhir periode
        </Button>
      </form>
      <InlineError message={state.error} />
    </div>
  );
}

/** Tombol "Lanjutkan langganan" — form + error inline. */
export function ResumeSubscriptionForm() {
  const [state, action, pending] = useActionState(resumeSubscriptionAction, initial);
  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="size-4" aria-hidden />
          )}
          Lanjutkan langganan
        </Button>
      </form>
      <InlineError message={state.error} />
    </div>
  );
}

/** Tombol "Batalkan" add-on — form per add-on + error inline. */
export function CancelAddOnButton({ addOnId }: { addOnId: string }) {
  const [state, action, pending] = useActionState(cancelAddOnAction, initial);
  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <input type="hidden" name="add_on_id" value={addOnId} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Minus className="size-4" aria-hidden />
          )}
          Batalkan
        </Button>
      </form>
      <InlineError message={state.error} />
    </div>
  );
}
