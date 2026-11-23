"use client";

import * as React from "react";
import { useEffect, useRef } from "react";
import { useActionState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CheckIcon, MessageCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecorIcon } from "@/components/decor-icon";
import { ACQUISITION_SOURCES, ACQUISITION_SOURCE_LABELS } from "@/lib/validators";
import { submitSubscribeAction, type SubscribeState } from "@/server/subscribe-action";
import type { PublicPlan, PublicAddOn } from "@/server/catalog";
import { addOnPriceForCycle, cycleUnit } from "@/lib/subscription-math";

const formatRupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

const initial: SubscribeState = {};

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-xs text-destructive">{error}</p>;
}

export function SubscribeForm({
  plan,
  addOns,
  planRequested = false,
}: {
  plan: PublicPlan | null;
  addOns: PublicAddOn[];
  planRequested?: boolean;
}) {
  const [state, formAction, pending] = useActionState(submitSubscribeAction, initial);
  const openedRef = useRef(false);

  useEffect(() => {
    if (state.waUrl && !openedRef.current) {
      openedRef.current = true;
      window.open(state.waUrl, "_blank", "noopener,noreferrer");
    }
  }, [state.waUrl]);

  if (state.waUrl) {
    return (
      <div className="w-full max-w-sm animate-in space-y-8">
        <div className="flex flex-col items-center space-y-4 text-center">
          <Image src="/snapyos-mark.png" alt="SnapyOS" width={48} height={48} className="size-12" />
          <div className="flex flex-col gap-5 text-center">
            <h1 className="text-balance font-display text-4xl uppercase leading-[0.95] tracking-tight md:text-5xl">
              Konsultasi berlangganan
            </h1>
            <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
              Isi data Anda, kami akan lanjutkan via WhatsApp.
            </p>
          </div>
        </div>
        <div
          role="status"
          className="border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111]"
        >
          <p className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink">
            {"Chat siap dibuka"}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            WhatsApp konsultasi terbuka di tab baru. Jika tidak terbuka,{" "}
            <a
              className="font-semibold text-ink underline underline-offset-4"
              href={state.waUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              buka chat manual
            </a>
            .
          </p>
        </div>
        <p className="text-muted-foreground text-sm">
          Data hanya digunakan untuk follow-up pemesanan.{" "}
          <Link className="underline underline-offset-4 hover:text-accent-4" href="/">
            Kembali ke beranda
          </Link>
          .
        </p>
      </div>
    );
  }

  const fieldErrors = state.fieldErrors ?? {};
  const cycle = plan?.billing_cycle ?? "monthly";
  const unit = cycleUnit(cycle);
  const availableAddOns = addOns.filter((a) => addOnPriceForCycle(a, cycle) !== null);

  const planLabel = plan ? `${plan.name} (${formatRupiah(plan.price)}/${unit})` : "";
  const addonsLabel = availableAddOns
    .map((a) => `${a.name} (${formatRupiah(addOnPriceForCycle(a, cycle) ?? 0)}/${unit})`)
    .join(", ");

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden px-6 py-12 md:px-8">
      <div className="relative flex w-full max-w-sm flex-col justify-between p-6 md:p-8">
        <div className="absolute -inset-y-6 -left-px w-px bg-border" />
        <div className="absolute -inset-y-6 -right-px w-px bg-border" />
        <div className="absolute -inset-x-6 -top-px h-px bg-border" />
        <div className="absolute -inset-x-6 -bottom-px h-px bg-border" />
        <DecorIcon position="top-left" />
        <DecorIcon position="bottom-right" />

        <div className="w-full max-w-sm animate-in space-y-8">
          <div className="flex flex-col items-center space-y-4 text-center">
            <Image
              src="/snapyos-mark.png"
              alt="SnapyOS"
              width={48}
              height={48}
              className="size-12"
            />
            <div className="flex flex-col gap-5 text-center">
              <h1 className="text-balance font-display text-4xl uppercase leading-[0.95] tracking-tight md:text-5xl">
                Konsultasi berlangganan
              </h1>
              <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
                Isi data Anda, kami akan lanjutkan via WhatsApp.
              </p>
            </div>
          </div>

          {planRequested && !plan && (
            <div
              role="status"
              className="border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111]"
            >
              <p className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink">
                Paket tidak dikenal.
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Kode paket pada link tidak cocok dengan katalog aktif. Pilih paket dari halaman
                harga, atau lanjutkan konsultasi tanpa paket.
              </p>
            </div>
          )}

          {(plan || availableAddOns.length > 0) && (
            <div className="border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111]">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink">
                Paket dipilih
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {plan && (
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckIcon className="size-4 text-accent-3-strong" />
                    {plan.name} ({formatRupiah(plan.price)}/{unit})
                  </li>
                )}
                {availableAddOns.map((a) => (
                  <li
                    key={a.code}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <CheckIcon className="size-4 text-accent-3-strong" />
                    {a.name} ({formatRupiah(addOnPriceForCycle(a, cycle) ?? 0)}/{unit})
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form action={formAction} noValidate className="space-y-4">
            <input type="hidden" name="plan" value={planLabel} />
            <input type="hidden" name="addons" value={addonsLabel} />

            <div className="space-y-2">
              <Input
                name="name"
                aria-label="Nama lengkap"
                placeholder="Nama lengkap"
                aria-invalid={Boolean(fieldErrors.name)}
                className="h-10"
              />
              <FieldError error={fieldErrors.name} />
            </div>

            <div className="space-y-2">
              <Input
                name="phone"
                aria-label="Nomor WhatsApp"
                placeholder="Nomor WhatsApp (+628…)"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                aria-invalid={Boolean(fieldErrors.phone)}
                className="h-10"
              />
              <FieldError error={fieldErrors.phone} />
              {!fieldErrors.phone && (
                <p className="text-xs text-muted-foreground">
                  Wajib format +62, contoh +6281234567890.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Input
                name="email"
                aria-label="Email terdaftar"
                placeholder="Email terdaftar"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.email)}
                className="h-10"
              />
              <FieldError error={fieldErrors.email} />
            </div>

            <div className="space-y-2">
              <Input
                name="location"
                aria-label="Lokasi atau kota bisnis"
                placeholder="Lokasi / kota bisnis"
                aria-invalid={Boolean(fieldErrors.location)}
                className="h-10"
              />
              <FieldError error={fieldErrors.location} />
            </div>

            <div className="space-y-2">
              <select
                name="source"
                aria-label="Darimana Anda tahu SnapyOS"
                defaultValue=""
                aria-invalid={Boolean(fieldErrors.source)}
                className="h-10 w-full rounded-none border-2 border-ink bg-surface px-2.5 text-base outline-none transition-colors focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ink/30 md:text-sm"
              >
                <option value="" disabled>
                  Dari mana Anda tahu SnapyOS?
                </option>
                {ACQUISITION_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {ACQUISITION_SOURCE_LABELS[source]}
                  </option>
                ))}
              </select>
              <FieldError error={fieldErrors.source} />
            </div>

            <div className="space-y-2">
              <Input
                name="booths"
                aria-label="Jumlah booth"
                placeholder="Jumlah booth"
                type="number"
                inputMode="numeric"
                min={0}
                max={1000}
                defaultValue="1"
                aria-invalid={Boolean(fieldErrors.booths)}
                className="h-10"
              />
              <FieldError error={fieldErrors.booths} />
            </div>

            {state.error && (
              <div
                role="alert"
                className="border-2 border-destructive bg-surface px-4 py-3 text-sm leading-6 text-ink shadow-[4px_4px_0_0_#111111]"
              >
                {state.error}
              </div>
            )}

            <Button className="w-full" size="lg" type="submit" disabled={pending}>
              {pending ? "Mengirim…" : "Kirim via WhatsApp"}
              <MessageCircleIcon />
            </Button>
          </form>

          <p className="text-muted-foreground text-sm">
            Data hanya digunakan untuk follow-up pemesanan.{" "}
            <Link className="underline underline-offset-4 hover:text-accent-4" href="/">
              Kembali ke beranda
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
