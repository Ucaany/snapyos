"use client";

import { useActionState } from "react";
import Link from "next/link";

import { resetPasswordAction, type FormState } from "@/server/auth-actions";

const initial: FormState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-2">
        <label
          htmlFor="password"
          className="font-mono text-xs font-bold uppercase tracking-[0.12em]"
        >
          Password baru
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          disabled={pending}
          className="min-h-11 border-2 border-ink bg-surface px-3 font-mono text-sm"
        />
        {state.fieldErrors?.password?.[0] && (
          <p role="alert" className="font-mono text-xs text-destructive">
            {state.fieldErrors.password[0]}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="confirm_password"
          className="font-mono text-xs font-bold uppercase tracking-[0.12em]"
        >
          Ulangi password
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          disabled={pending}
          className="min-h-11 border-2 border-ink bg-surface px-3 font-mono text-sm"
        />
        {state.fieldErrors?.confirm_password?.[0] && (
          <p role="alert" className="font-mono text-xs text-destructive">
            {state.fieldErrors.confirm_password[0]}
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
        <div className="flex flex-col gap-3 border-2 border-ink bg-accent px-3 py-2">
          <p role="status" className="font-mono text-xs">
            {state.success}
          </p>
          <Link href="/login" className="font-mono text-xs font-bold underline">
            Ke halaman masuk
          </Link>
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 border-2 border-ink bg-ink px-6 font-mono text-sm font-bold uppercase tracking-[0.08em] text-bg shadow-hard disabled:opacity-60"
      >
        {pending ? "Menyimpan" : "Simpan password"}
      </button>
    </form>
  );
}
