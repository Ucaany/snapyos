"use client";

import { useActionState } from "react";

import { acceptInvitationAction } from "@/server/staff-actions";
import type { FormState } from "@/server/auth-actions";

const initial: FormState = {};

export function InviteAcceptForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p
          role="alert"
          className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs"
        >
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 border-2 border-ink bg-ink px-6 font-mono text-sm font-bold uppercase tracking-[0.08em] text-bg shadow-hard disabled:opacity-60"
      >
        {pending ? "Memproses" : "Terima undangan"}
      </button>
    </form>
  );
}
