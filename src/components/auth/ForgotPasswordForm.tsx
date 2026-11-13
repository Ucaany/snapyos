"use client";

import { useActionState } from "react";

import { requestPasswordResetAction, type FormState } from "@/server/auth-actions";

const initial: FormState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="font-mono text-xs font-bold uppercase tracking-[0.12em]">
          Email akun
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="nama@bisnis.id"
          disabled={pending}
          className="min-h-11 border-2 border-ink bg-surface px-3 font-mono text-sm"
        />
        {state.fieldErrors?.email?.[0] && (
          <p role="alert" className="font-mono text-xs text-destructive">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>
      {state.error && (
        <p
          role="alert"
          className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs"
        >
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="border-2 border-ink bg-accent px-3 py-2 font-mono text-xs">
          {state.success}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 border-2 border-ink bg-ink px-6 font-mono text-sm font-bold uppercase tracking-[0.08em] text-bg shadow-hard disabled:opacity-60"
      >
        {pending ? "Mengirim" : "Kirim tautan reset"}
      </button>
    </form>
  );
}
