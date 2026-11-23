"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { PaymentCredentialCard } from "@/components/dashboard/PaymentCredentialCard";
import { PaymentCredentialForm } from "@/components/dashboard/PaymentCredentialForm";
import { Button } from "@/components/ui/button";
import type { PaymentCredentialPublic, PaymentWebhookStatus } from "@/lib/payment-credentials";
import type { GatewayProvider } from "@/server/payment/providers/types";

type Props = {
  initialCredentials: PaymentCredentialPublic[];
  /** Diagnosa webhook per provider — dihitung server dari SnapyOS_PUBLIC_BASE_URL. */
  webhookUrls: Record<GatewayProvider, PaymentWebhookStatus>;
};

type Environment = "sandbox" | "production";
const ENVIRONMENTS: readonly Environment[] = ["sandbox", "production"];

const PROVIDERS: { id: GatewayProvider; name: string; description: string }[] = [
  {
    id: "tripay",
    name: "TRIPAY",
    description:
      "Channel pembayaran merchant owner (gateway utama). Butuh private key untuk signature; webhook wajib terdaftar.",
  },
  {
    id: "midtrans",
    name: "MIDTRANS",
    description:
      "Snap/QRIS merchant owner. Tes sandbox membuat transaksi uji; production hanya verifikasi kredensial.",
  },
];

/**
 * PaymentGatewaySettings — shell dashboard/payment (owner-only).
 * Direct merchant model: credential tripay/midtrans owner, dana langsung
 * ke rekening owner. Metode kiosk dibangun dari credential aktif (docs/06 §6.5).
 * Satu provider bisa punya credential sandbox DAN production sekaligus
 * (unique business_id+provider+environment).
 */
export function PaymentGatewaySettings({ initialCredentials, webhookUrls }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<{
    provider: GatewayProvider;
    environment: Environment;
  } | null>(null);
  const refresh = () => router.refresh();

  return (
    <div className="grid max-w-6xl gap-6">
      {editing && (
        <PaymentCredentialForm
          key={`${editing.provider}-${editing.environment}`}
          initialProvider={editing.provider}
          initialEnvironment={editing.environment}
          webhookUrls={webhookUrls}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      <section className="grid gap-4" aria-labelledby="configured-gateways">
        <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
          <h2 id="configured-gateways" className="font-display text-2xl uppercase tracking-tight">
            Gateway per Provider
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em]">
            [ SERVER-REDACTED ]
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {PROVIDERS.map((provider) => {
            const matches = initialCredentials.filter((item) => item.provider === provider.id);
            const missing = ENVIRONMENTS.filter(
              (env) => !matches.some((c) => c.environment === env)
            );
            return (
              <div key={provider.id} className="grid gap-4">
                {matches.map((credential) => (
                  <PaymentCredentialCard
                    key={credential.id}
                    credential={credential}
                    webhookUrls={webhookUrls}
                    onChanged={refresh}
                  />
                ))}
                {matches.length === 0 ? (
                  <article className="grid gap-4 border-2 border-ink bg-surface p-5 shadow-hard">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink pb-3">
                      <h3 className="font-display text-xl uppercase tracking-tight">
                        {provider.name}
                      </h3>
                      <span className="border-2 border-ink bg-muted px-2 py-1 font-mono text-[10px] font-bold uppercase">
                        BELUM DIISI
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {provider.description}
                    </p>
                    <div className="flex flex-wrap justify-end gap-3">
                      {ENVIRONMENTS.map((env) => (
                        <Button
                          key={env}
                          type="button"
                          variant="neutral"
                          size="sm"
                          onClick={() => setEditing({ provider: provider.id, environment: env })}
                        >
                          Tambah {env}
                        </Button>
                      ))}
                    </div>
                  </article>
                ) : (
                  missing.map((env) => (
                    <article
                      key={`${provider.id}-${env}`}
                      className="grid gap-4 border-2 border-ink bg-surface p-5 shadow-hard"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink pb-3">
                        <h3 className="font-display text-xl uppercase tracking-tight">
                          {provider.name}
                        </h3>
                        <span className="border-2 border-ink bg-muted px-2 py-1 font-mono text-[10px] font-bold uppercase">
                          {`BELUM DIISI · ${env.toUpperCase()}`}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {provider.description}
                      </p>
                      <div className="flex justify-end gap-3">
                        <Button
                          type="button"
                          variant="neutral"
                          size="sm"
                          onClick={() => setEditing({ provider: provider.id, environment: env })}
                        >
                          Tambah credential
                        </Button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
