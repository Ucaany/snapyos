"use client";

import * as React from "react";
import { useRef, useState } from "react";
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

import {
  loginAction,
  staffLoginBoothsAction,
  type FormState,
} from "@/server/auth-actions";

type LoginBooth = { photobox_id: string; name: string };
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
      className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-foreground"
    >
      {error}
    </div>
  );
}

export function AuthPage() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const fieldErrors = (state.fieldErrors ?? {}) as FieldErrors;

  const [booths, setBooths] = useState<LoginBooth[]>([]);
  const [pinMode, setPinMode] = useState(false);
  const [loadingBooths, setLoadingBooths] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  const captchaSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  // Tanpa site key (dev) → tidak ada gate CAPTCHA.
  const captchaBlocked = Boolean(captchaSiteKey) && !captchaVerified;

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
                  placeholder="your.email@example.com"
                  required
                  autoComplete="email"
                  aria-invalid={Boolean(fieldErrors.email)}
                  disabled={pending}
                  ref={emailRef}
                  onBlur={() => void refreshBooths()}
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
                  <select
                    id="photobox_id"
                    name="photobox_id"
                    required
                    disabled={pending || loadingBooths}
                    aria-invalid={Boolean(fieldErrors.photobox_id)}
                    className="h-8 w-full flex-1 appearance-none rounded-lg border-0 bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  >
                    <option value="">Pilih booth…</option>
                    {booths.map((booth) => (
                      <option key={booth.photobox_id} value={booth.photobox_id}>
                        {booth.name}
                      </option>
                    ))}
                  </select>
                </InputGroup>
                {fieldErrors.photobox_id && (
                  <FieldError errors={fieldErrors.photobox_id} />
                )}

                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <KeyRoundIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="pin"
                    name="pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                    required
                    placeholder="PIN booth (4–6 digit)"
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
