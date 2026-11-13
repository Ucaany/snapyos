"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePasswordAction, type FormState } from "@/server/auth-actions";

const initial: FormState = {};

/**
 * Ganti password terautentikasi (AUTH-01). Password lama wajib benar; password
 * baru minimal 8 karakter dan berbeda dari yang lama.
 */
export function PasswordChangeForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initial);
  const currentError = state.fieldErrors?.["current_password"]?.[0];
  const newError = state.fieldErrors?.["new_password"]?.[0];

  return (
    <form action={formAction} noValidate className="contents">
      <section
        className="border-2 border-ink bg-surface p-6 shadow-hard"
        aria-labelledby="password-settings-heading"
      >
        <div className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
          <h2
            id="password-settings-heading"
            className="font-display text-lg uppercase tracking-tight"
          >
            Password Akun
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            05 / SECURITY
          </span>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="current-password"
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Password saat ini
            </label>
            <Input
              id="current-password"
              name="current_password"
              type="password"
              autoComplete="current-password"
              disabled={pending}
              aria-invalid={Boolean(currentError)}
            />
            {currentError ? (
              <p role="alert" className="font-mono text-xs text-destructive">
                {currentError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="new-password" className="font-mono text-xs uppercase tracking-[0.1em]">
              Password baru
            </label>
            <Input
              id="new-password"
              name="new_password"
              type="password"
              autoComplete="new-password"
              disabled={pending}
              aria-invalid={Boolean(newError)}
            />
            {newError ? (
              <p role="alert" className="font-mono text-xs text-destructive">
                {newError}
              </p>
            ) : (
              <p className="max-w-[65ch] font-mono text-xs leading-relaxed text-muted-foreground">
                Minimal 8 karakter. Gunakan kombinasi yang tidak dipakai di layanan lain.
              </p>
            )}
          </div>

          {state.error ? (
            <p role="alert" className="font-mono text-xs text-destructive">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p role="status" className="font-mono text-xs text-ink">
              {state.success}
            </p>
          ) : null}

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan..." : "Simpan password"}
            </Button>
          </div>
        </div>
      </section>
    </form>
  );
}
