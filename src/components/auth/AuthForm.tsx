"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  loginAction,
  registerAction,
  staffLoginBoothsAction,
  type FormState,
} from "@/server/auth-actions";
import {
  ACQUISITION_SOURCES,
  ACQUISITION_SOURCE_LABELS,
} from "@/lib/validators";

type FieldErrors = Record<string, string[]>;

type LoginBooth = { photobox_id: string; name: string };

const initial: FormState = {};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p role="alert" className="font-mono text-xs text-destructive">
      {errors[0]}
    </p>
  );
}

function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs leading-relaxed text-ink"
    >
      {error}
    </div>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction, pending] = useActionState(action, initial);
  const fieldErrors = (state.fieldErrors ?? {}) as FieldErrors;

  const [booths, setBooths] = useState<LoginBooth[]>([]);
  const [pinMode, setPinMode] = useState(false);
  const [loadingBooths, setLoadingBooths] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  async function refreshBooths() {
    const email = emailRef.current?.value ?? "";
    setLoadingBooths(true);
    try {
      const list = await staffLoginBoothsAction(email);
      setBooths(list);
      setPinMode(list.length > 0);
    } catch {
      setBooths([]);
      setPinMode(false);
    } finally {
      setLoadingBooths(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-semibold text-[#0069e0]">
          {mode === "login" ? "Masuk ke SnapyOS" : "Pendaftaran akun"}
        </p>
        <h1 className="marketing-display mt-3 text-5xl leading-[.92] text-[#0a0d12]">
          {mode === "login" ? "Masuk" : "Buat akun"}
        </h1>
        <p className="mt-4 text-base leading-7 text-[#535862]">
          {mode === "login"
            ? "Kelola bisnis photobox Anda dari satu dashboard."
            : "Mulai bisnis photobox Anda dengan trial gratis."}
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-5" noValidate>
        {mode === "register" && (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor="name" className="font-mono text-xs uppercase tracking-[0.1em]">
                Nama lengkap
              </label>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                required
                placeholder="cth. Budi Santoso"
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "name-error" : undefined}
                disabled={pending}
              />
              {fieldErrors.name && (
                <span id="name-error">
                  <FieldError errors={fieldErrors.name} />
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="whatsapp" className="font-mono text-xs uppercase tracking-[0.1em]">
                Nomor WhatsApp
              </label>
              <Input
                id="whatsapp"
                name="whatsapp"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                required
                placeholder="cth. 08123456789"
                aria-invalid={Boolean(fieldErrors.whatsapp)}
                aria-describedby={fieldErrors.whatsapp ? "whatsapp-error" : "whatsapp-hint"}
                disabled={pending}
              />
              {fieldErrors.whatsapp ? (
                <span id="whatsapp-error">
                  <FieldError errors={fieldErrors.whatsapp} />
                </span>
              ) : (
                <span id="whatsapp-hint" className="font-mono text-[10px] text-muted-foreground">
                  Format 08… / +628…. Dipakai admin untuk follow-up.
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="acquisition_source"
                className="font-mono text-xs uppercase tracking-[0.1em]"
              >
                Darimana Anda mengetahui SnapyOS?
              </label>
              <select
                id="acquisition_source"
                name="acquisition_source"
                required
                defaultValue=""
                aria-invalid={Boolean(fieldErrors.acquisition_source)}
                aria-describedby={
                  fieldErrors.acquisition_source ? "acquisition_source-error" : undefined
                }
                disabled={pending}
                className="h-11 w-full rounded-none border-2 border-ink bg-surface px-3 text-base text-ink shadow-[2px_2px_0_0_#111111] outline-none transition-all focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm"
              >
                <option value="" disabled>
                  Pilih sumber…
                </option>
                {ACQUISITION_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {ACQUISITION_SOURCE_LABELS[source]}
                  </option>
                ))}
              </select>
              {fieldErrors.acquisition_source && (
                <span id="acquisition_source-error">
                  <FieldError errors={fieldErrors.acquisition_source} />
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="planned_devices"
                className="font-mono text-xs uppercase tracking-[0.1em]"
              >
                Perkiraan jumlah booth
              </label>
              <Input
                id="planned_devices"
                name="planned_devices"
                type="number"
                inputMode="numeric"
                min={0}
                max={1000}
                defaultValue={1}
                required
                aria-invalid={Boolean(fieldErrors.planned_devices)}
                aria-describedby={
                  fieldErrors.planned_devices ? "planned_devices-error" : undefined
                }
                disabled={pending}
              />
              {fieldErrors.planned_devices && (
                <span id="planned_devices-error">
                  <FieldError errors={fieldErrors.planned_devices} />
                </span>
              )}
            </div>
          </>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="font-mono text-xs uppercase tracking-[0.1em]">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="nama@bisnis.id"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            disabled={pending}
            ref={emailRef}
            onBlur={mode === "login" ? () => void refreshBooths() : undefined}
          />
          {fieldErrors.email && (
            <span id="email-error">
              <FieldError errors={fieldErrors.email} />
            </span>
          )}
        </div>

        {mode === "login" && pinMode ? (
          <>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="photobox_id"
                className="font-mono text-xs uppercase tracking-[0.1em]"
              >
                Booth
              </label>
              <Select
                id="photobox_id"
                name="photobox_id"
                required
                disabled={pending || loadingBooths}
              >
                <option value="">Pilih booth…</option>
                {booths.map((booth) => (
                  <option key={booth.photobox_id} value={booth.photobox_id}>
                    {booth.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="pin"
                className="font-mono text-xs uppercase tracking-[0.1em]"
              >
                PIN
              </label>
              <Input
                id="pin"
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                required
                placeholder="••••"
                maxLength={6}
                aria-invalid={Boolean(fieldErrors.pin)}
                aria-describedby={fieldErrors.pin ? "pin-error" : undefined}
                disabled={pending}
              />
              {fieldErrors.pin && (
                <span id="pin-error">
                  <FieldError errors={fieldErrors.pin} />
                </span>
              )}
              <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
                Login staff: email + PIN booth (tanpa password).
              </p>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <label
              htmlFor="password"
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              placeholder={mode === "register" ? "Minimal 8 karakter" : "••••••••"}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              disabled={pending}
            />
            {fieldErrors.password && (
              <span id="password-error">
                <FieldError errors={fieldErrors.password} />
              </span>
            )}
          </div>
        )}

        <FormError error={state.error} />

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Memproses…" : mode === "login" ? "Masuk" : "Buat akun"}
        </Button>
      </form>

      <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
        {mode === "login" ? (
          <>
            Belum punya akun?{" "}
            <Link href="/register" className="text-ink underline underline-offset-4">
              Daftar
            </Link>
          </>
        ) : (
          <>
            Sudah punya akun?{" "}
            <Link href="/login" className="text-ink underline underline-offset-4">
              Masuk
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
