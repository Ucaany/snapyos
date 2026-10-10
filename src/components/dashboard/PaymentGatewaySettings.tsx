"use client";

import { useRouter } from "next/navigation";

import { PaymentCredentialCard } from "@/components/dashboard/PaymentCredentialCard";
import { PaymentCredentialForm } from "@/components/dashboard/PaymentCredentialForm";
import type { PaymentCredentialPublic } from "@/lib/payment-credentials";

type Props = {
  initialCredentials: PaymentCredentialPublic[];
};

/**
 * PaymentGatewaySettings — shell dashboard/payment (owner-only).
 * Direct merchant model: credential pakasir/midtrans/tripay owner, dana langsung
 * ke rekening owner. Metode kiosk dibangun dari credential aktif (docs/06 §6.5).
 */
export function PaymentGatewaySettings({ initialCredentials }: Props) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="grid max-w-6xl grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <PaymentCredentialForm onSaved={refresh} />

      <section className="grid gap-4" aria-labelledby="configured-gateways">
        <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
          <h2
            id="configured-gateways"
            className="font-display text-2xl uppercase tracking-tight"
          >
            Gateway Tersimpan
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em]">
            [ SERVER-REDACTED ]
          </span>
        </div>

        {initialCredentials.length === 0 && (
          <p className="border-2 border-ink bg-muted p-5 font-mono text-xs uppercase tracking-[0.08em]">
            Belum ada gateway. Tambahkan credential sandbox terlebih dahulu. Kiosk customer hanya
            lihat Voucher + Tunai sampai gateway aktif tersimpan.
          </p>
        )}

        {initialCredentials.map((credential) => (
          <PaymentCredentialCard key={credential.id} credential={credential} onChanged={refresh} />
        ))}
      </section>
    </div>
  );
}