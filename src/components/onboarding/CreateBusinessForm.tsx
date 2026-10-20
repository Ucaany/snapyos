"use client";

import { useActionState, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { slugify, isValidSlug, RESERVED_SLUGS } from "@/lib/slug";
import { createBusinessAction } from "@/server/business-actions";
import type { FormState } from "@/server/auth-actions";

const initial: FormState = {};

/**
 * Onboarding — buat business pertama (docs/04 onboarding, docs/12 Phase 1).
 * Live slug preview (auto dari nama, bisa ditimpa), validasi slug
 * (reserved + pola), dan indikator status OK/X.
 */
export function CreateBusinessForm() {
  const [state, formAction, pending] = useActionState(createBusinessAction, initial);
  const [name, setName] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slug, setSlug] = useState("");
  const nameId = useId();
  const slugId = useId();

  const effectiveSlug = useMemo(
    () => (slugEdited ? slug : slugify(name)),
    [name, slug, slugEdited]
  );
  const slugValidation = useMemo(() => {
    if (!effectiveSlug) return { state: "idle" as const, msg: null };
    if (RESERVED_SLUGS.includes(effectiveSlug as (typeof RESERVED_SLUGS)[number])) {
      return { state: "invalid" as const, msg: "Slug dipesan sistem, pilih lain" };
    }
    if (!isValidSlug(effectiveSlug)) {
      return { state: "invalid" as const, msg: "Min 3 karakter · huruf kecil/angka/strip" };
    }
    return { state: "ok" as const, msg: null };
  }, [effectiveSlug]);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor={nameId} className="font-mono text-[11px] uppercase tracking-[0.16em]">
            <span className="text-destructive">*</span> Nama bisnis
          </label>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {name.length}/80
          </span>
        </div>
        <Input
          id={nameId}
          name="name"
          required
          maxLength={80}
          placeholder="cth. KLIK FOTO"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(state.fieldErrors?.name)}
          disabled={pending}
          autoFocus
          autoComplete="organization"
        />
        {state.fieldErrors?.name ? (
          <p role="alert" className="font-mono text-xs text-destructive">
            {"/// ERR · "}
            {state.fieldErrors.name[0]}
          </p>
        ) : (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Nama tampil di dashboard, kiosk customer, &amp; struk.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor={slugId} className="font-mono text-[11px] uppercase tracking-[0.16em]">
            Slug URL <span className="text-muted-foreground">(opsional)</span>
          </label>
          <button
            type="button"
            onClick={() => {
              setSlugEdited(false);
              setSlug("");
            }}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
            disabled={pending || (!slugEdited && !slug)}
          >
            Reset ke auto
          </button>
        </div>
        <div className="flex items-center border-2 border-ink bg-surface shadow-[2px_2px_0_0_#111111] focus-within:shadow-none focus-within:translate-x-[2px] focus-within:translate-y-[2px]">
          <span className="select-none border-r-2 border-ink bg-ink px-3 py-2 font-mono text-xs uppercase tracking-[0.1em] text-bg">
            /p/
          </span>
          <Input
            id={slugId}
            name="slug"
            value={slugEdited ? slug : effectiveSlug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value);
            }}
            aria-invalid={Boolean(state.fieldErrors?.slug) || slugValidation.state === "invalid"}
            disabled={pending}
            className="flex-1 border-0 bg-transparent px-3 py-2 font-mono text-sm shadow-none focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50"
            placeholder="klik-foto"
            maxLength={48}
          />
          <span
            aria-hidden
            className={`flex h-full items-center border-l-2 px-2 font-mono text-[10px] uppercase tracking-[0.16em] ${
              slugValidation.state === "ok"
                ? "border-accent-3 bg-accent-3/20 text-ink"
                : slugValidation.state === "invalid"
                  ? "border-destructive bg-destructive/15 text-destructive"
                  : "border-ink/20 bg-muted text-muted-foreground"
            }`}
          >
            {slugValidation.state === "ok" ? "OK" : slugValidation.state === "invalid" ? "X" : "·"}
          </span>
        </div>
        {state.fieldErrors?.slug ? (
          <p role="alert" className="font-mono text-xs text-destructive">
            {"/// ERR · "}
            {state.fieldErrors.slug[0]}
          </p>
        ) : slugValidation.msg ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-destructive">
            {slugValidation.msg}
          </p>
        ) : (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Auto dari nama · hanya huruf kecil, angka, tanda hubung.
          </p>
        )}
      </div>

      {state.error ? (
        <div
          role="alert"
          className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs leading-relaxed text-ink"
        >
          <span className="mr-2 font-bold uppercase tracking-[0.16em] text-destructive">
            {"/// ERR"}
          </span>
          {state.error}
        </div>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Dengan lanjut, Anda setuju trial Starter otomatis aktif.
        </p>
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="font-display min-h-11 uppercase tracking-tight shadow-[4px_4px_0_0_#111111] active:translate-y-[2px] active:shadow-none"
        >
          {pending ? "Membuat..." : "Buat Bisnis"}
        </Button>
      </div>
    </form>
  );
}
