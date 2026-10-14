"use client";

import * as React from "react";
import { useState } from "react";
import { useActionState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AtSignIcon, KeyRoundIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { AuthDivider } from "@/components/auth-divider";
import { DecorIcon } from "@/components/decor-icon";
import { TurnstileWidget } from "@/components/turnstile-widget";

import { loginAction, type FormState } from "@/server/auth-actions";

type FieldErrors = Record<string, string[]>;

const initial: FormState = {};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p role="alert" className="text-xs text-destructive">{errors[0]}</p>;
}

function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs leading-relaxed text-foreground"
    >
      {error}
    </div>
  );
}

export function AuthPage() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const fieldErrors = (state.fieldErrors ?? {}) as FieldErrors;

  const [pinMode, setPinMode] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");

  const captchaSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  // Tanpa site key (dev) → tidak ada gate CAPTCHA.
  const captchaBlocked = Boolean(captchaSiteKey) && !captchaVerified;

  return (
    <div className="relative flex h-screen w-full items-center justify-center overflow-hidden px-6 md:px-8">
      <div
        className={cn(
          "relative flex w-full max-w-sm flex-col justify-between p-6 md:p-8",
          "dark:bg-[radial-gradient(50%_80%_at_20%_0%,--theme(--color-foreground/.1),transparent)]"
        )}
      >
        <div className="absolute -inset-y-6 -left-px w-px bg-border" />
        <div className="absolute -inset-y-6 -right-px w-px bg-border" />
        <div className="absolute -inset-x-6 -top-px h-px bg-border" />
        <div className="absolute -inset-x-6 -bottom-px h-px bg-border" />
        <DecorIcon position="top-left" />
        <DecorIcon position="bottom-right" />

        <div className="w-full max-w-sm animate-in space-y-8">
          <div className="flex flex-col items-center space-y-4 text-center">
            <Image
              src="/avatar-snappy/4.svg"
              alt="SnapyOS"
              width={48}
              height={48}
              className="size-12"
            />
            <div className="flex flex-col space-y-1">
              <h1 className="font-bold text-2xl tracking-wide">Masuk ke SnapyOS</h1>
              <p className="text-base text-muted-foreground">
                Kelola bisnis photobox Anda dari satu dashboard.
              </p>
            </div>
          </div>

          <form action={formAction} noValidate autoComplete="on" className="space-y-4">
            <div className="space-y-2">
              <InputGroup>
                <InputGroupAddon align="inline-start">
                  <AtSignIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="email"
                  name="email"
                  type="email"
                  aria-label="Email"
                  placeholder="your.email@example.com"
                  required
                  autoComplete="email"
                  aria-invalid={Boolean(fieldErrors.email)}
                  disabled={pending}
                />
              </InputGroup>
              {fieldErrors.email && <FieldError errors={fieldErrors.email} />}
            </div>

            {pinMode ? (
              <div className="space-y-2">
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <KeyRoundIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="pin"
                    name="pin"
                    type="password"
                    aria-label="PIN staff"
                    inputMode="numeric"
                    autoComplete="current-password"
                    required
                    placeholder="PIN staff (4–6 digit)"
                    maxLength={6}
                    aria-invalid={Boolean(fieldErrors.pin)}
                    disabled={pending}
                  />
                </InputGroup>
                {fieldErrors.pin && <FieldError errors={fieldErrors.pin} />}
              </div>
            ) : (
              <div className="space-y-2">
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <KeyRoundIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="password"
                    name="password"
                    type="password"
                    aria-label="Password"
                    autoComplete="current-password"
                    required
                    placeholder="Password"
                    aria-invalid={Boolean(fieldErrors.password)}
                    disabled={pending}
                  />
                </InputGroup>
                {fieldErrors.password && (
                  <FieldError errors={fieldErrors.password} />
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setPinMode((mode) => !mode)}
              aria-pressed={pinMode}
              className="flex min-h-11 w-full items-center text-left font-mono text-xs uppercase tracking-[0.05em] text-muted-foreground underline underline-offset-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {pinMode ? "Masuk dengan password" : "Masuk dengan PIN staff"}
            </button>

            <FormError error={state.error} />

            <TurnstileWidget
              siteKey={captchaSiteKey}
              action="login"
              onVerified={setCaptchaVerified}
              onToken={setCaptchaToken}
            />
            {captchaSiteKey && (
              <input type="hidden" name="cf-turnstile-response" value={captchaToken} />
            )}

            <Button className="w-full" size="sm" type="submit" disabled={pending || captchaBlocked}>
              {pending ? "Memproses…" : captchaBlocked ? "Menunggu verifikasi…" : "Masuk"}
            </Button>
          </form>

          <AuthDivider>Belum punya akun?</AuthDivider>

          <p className="text-muted-foreground text-sm">
            Hubungi admin SnapyOS untuk pembuatan akun.{" "}
            <Link
              className="underline underline-offset-4 hover:text-primary"
              href="/register"
            >
              Pelajari cara mendaftar
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
