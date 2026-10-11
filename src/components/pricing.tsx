"use client";

import { useState } from "react";
import { motion, type Variants } from "motion/react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FancyButton } from "@/components/ui/pricing-9-utils/fancy-button";
import { SectionHeader } from "@/components/section-header";
import {
  ArrowUpRightIcon,
  CheckIcon,
  PlusIcon,
} from "lucide-react";
import type { PublicPlan, PublicAddOn } from "@/server/catalog";

const animVariant: Variants = {
  initial: { opacity: 0, y: 10, filter: "blur(4px)", scale: 0.98 },
  animate: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    scale: 1,
    transition: {
      delay: i * 0.03,
      type: "spring",
      damping: 22,
      stiffness: 280,
    },
  }),
  exit: {
    opacity: 0,
    y: -10,
    filter: "blur(4px)",
    scale: 0.98,
    transition: { duration: 0.14 },
  },
};

const formatRupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

export function Pricing({
  plans,
  addOns,
}: {
  plans: PublicPlan[];
  addOns: PublicAddOn[];
}) {
  const [selectedPlanCode, setSelectedPlanCode] = useState(
    plans[0]?.code ?? "",
  );
  const [selectedAddOns, setSelectedAddOns] = useState<Set<string>>(new Set());

  const selectedPlan =
    plans.find((p) => p.code === selectedPlanCode) ?? plans[0];

  const totalPrice =
    (selectedPlan?.price_monthly ?? 0) +
    addOns
      .filter((a) => selectedAddOns.has(a.code))
      .reduce((sum, a) => sum + a.price_monthly, 0);

  const toggleAddOn = (code: string) => {
    setSelectedAddOns((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const subscribeHref =
    `/subscribe?plan=${encodeURIComponent(selectedPlan?.code ?? "")}` +
    (selectedAddOns.size
      ? `&addons=${encodeURIComponent([...selectedAddOns].join(","))}`
      : "");

  const basePrice = selectedPlan?.price_monthly ?? 0;

  if (plans.length === 0) {
    return (
      <section aria-label="Harga" className="mx-auto w-full max-w-4xl px-4 md:px-8">
        <div className="flex flex-col items-center gap-8">
          <SectionHeader
            badge="Bangun Paket Anda"
            title="Bayar sesuai kebutuhan"
            subtitle="Mulai dari paket dasar lalu tambah add-on sesuai pertumbuhan bisnis Anda."
          />
          <div className="w-full rounded-none border-2 border-ink bg-surface p-6 text-center shadow-[4px_4px_0_0_#111111] md:p-8" role="status">
            <p className="text-sm font-medium text-foreground">Katalog harga belum tersedia.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Coba muat ulang halaman, atau hubungi tim via WhatsApp konsultasi.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Harga" className="mx-auto w-full max-w-4xl px-4 md:px-8">
      <div className="flex flex-col items-center gap-8">
        <SectionHeader
          badge="Bangun Paket Anda"
          title="Bayar sesuai kebutuhan"
          subtitle="Mulai dari paket dasar lalu tambah add-on sesuai pertumbuhan bisnis Anda."
        />

        <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-6 rounded-none border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111] md:p-8">
            <div className="flex flex-col gap-2">
              <h3 className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-foreground">Pilih paket</h3>
              <p className="text-xs text-muted-foreground">
                Fitur menentukan paket; perangkat tambahan lewat add-on.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {plans.map((plan) => {
                const active = plan.code === selectedPlan?.code;
                return (
                  <button
                    key={plan.code}
                    type="button"
                    onClick={() => setSelectedPlanCode(plan.code)}
                    className={`flex items-center justify-between gap-3 rounded-none border-2 border-ink p-3 text-left transition-colors ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">
                        {plan.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatRupiah(plan.price_monthly)}/bulan
                      </span>
                    </div>
                    <span
                      className={`flex size-5 items-center justify-center rounded-none border-2 border-ink ${
                        active ? "border-primary bg-primary" : "border-border"
                      }`}
                    >
                      {active && <CheckIcon className="size-3 text-primary-foreground" />}
                    </span>
                  </button>
                );
              })}
            </div>

            {addOns.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-foreground">Modul add-on</h3>
                <div className="flex flex-col gap-2">
                  {addOns.map((addOn) => {
                    const enabled = selectedAddOns.has(addOn.code);
                    return (
                      <div
                        key={addOn.code}
                        className="flex items-center justify-between gap-4 rounded-none p-2"
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => toggleAddOn(addOn.code)}
                          className="h-auto flex-1 justify-start rounded-none px-0 py-0 hover:bg-transparent"
                        >
                          <div className="flex items-center gap-3 text-left">
                            <div
                              className={`flex size-8 items-center justify-center rounded-none border-2 border-ink transition-colors ${
                                enabled
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <PlusIcon className="size-4" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-foreground">
                                {addOn.name}
                              </span>
                              <span className="text-start text-xs text-muted-foreground">
                                +{formatRupiah(addOn.price_monthly)}/bulan
                              </span>
                            </div>
                          </div>
                        </Button>
                        <Switch
                          checked={enabled}
                          aria-label={`Aktifkan ${addOn.name}`}
                          onCheckedChange={() => toggleAddOn(addOn.code)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-6 rounded-none border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111] md:p-8">
            <div className="flex flex-col gap-2">
              <h3 className="font-display text-base font-bold uppercase tracking-tight text-ink">Paket Anda</h3>
              <p className="text-xs text-muted-foreground">
                {selectedPlan?.name ?? "Paket"} + {selectedAddOns.size} add-on dipilih
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-1">
                <motion.span
                  key={totalPrice}
                  variants={animVariant}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
                >
                  {formatRupiah(totalPrice)}
                </motion.span>
                <span key="period" className="text-sm text-muted-foreground sm:text-base">
                  /bulan
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {selectedPlan?.name ?? "Dasar"}: {formatRupiah(basePrice)} + Add-on:{" "}
                {formatRupiah(totalPrice - basePrice)}
              </p>
            </div>

            <a href={subscribeHref}>
              <FancyButton size="lg" className="w-full">
                Lanjut konsultasi
                <ArrowUpRightIcon />
              </FancyButton>
            </a>

            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium text-foreground">Selalu termasuk</p>
              <ul className="flex flex-col gap-2.5">
                <li className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-none bg-primary">
                    <CheckIcon className="size-2.5 text-primary-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    1 bisnis, 1 outlet, 1 perangkat online
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-none bg-primary">
                    <CheckIcon className="size-2.5 text-primary-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Dashboard pendapatan
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-none bg-primary">
                    <CheckIcon className="size-2.5 text-primary-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Dukungan email
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
