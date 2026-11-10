import Link from "next/link";

import type { KioskPaymentMethod } from "@/lib/kiosk-types";

type Props = {
  booths: { id: string; name: string; payment_mode: "gateway" | "voucher" | null }[];
  selectedId: string | null;
  methods: KioskPaymentMethod[];
  basePath: string;
};

const KIND_LABEL: Record<KioskPaymentMethod["kind"], string> = {
  gateway: "ONLINE",
  voucher: "VOUCHER",
  cash: "TUNAI",
};

/**
 * KioskPaymentPreview — hasil nyata `listKioskPaymentMethods` untuk satu booth.
 * Bukan estimasi: credential aktif + metode tersimpan + filter `payment_mode`
 * booth + feature gate `cash_payment` semuanya sudah diterapkan server.
 */
export function KioskPaymentPreview({ booths, selectedId, methods, basePath }: Props) {
  return (
    <section
      aria-labelledby="kiosk-method-preview"
      className="grid gap-3 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111]"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
        <h2 id="kiosk-method-preview" className="font-display text-xl uppercase tracking-tight">
          Metode yang muncul di kiosk
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em]">[ LIVE BOOTH ]</span>
      </div>

      {booths.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Belum ada booth. Tambahkan photobox dulu untuk melihat pratinjau metode kiosk.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {booths.map((booth) => (
              <Link
                key={booth.id}
                href={`${basePath}?booth=${booth.id}`}
                aria-current={booth.id === selectedId ? "true" : undefined}
                className={
                  booth.id === selectedId
                    ? "border-2 border-ink bg-accent px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
                    : "border-2 border-ink bg-surface px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] hover:bg-muted"
                }
              >
                {booth.name}
                {booth.payment_mode ? ` · ${booth.payment_mode}` : ""}
              </Link>
            ))}
          </div>

          {methods.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Booth ini tidak menawarkan metode apa pun. Periksa `payment_mode` booth dan credential
              aktif.
            </p>
          ) : (
            <ul className="grid gap-2">
              {methods.map((method) => (
                <li
                  key={method.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-2 border-ink bg-muted px-3 py-2 font-mono text-xs"
                >
                  <span className="font-bold uppercase tracking-[0.06em]">{method.label}</span>
                  <span className="text-muted-foreground">
                    {KIND_LABEL[method.kind]} · {method.display} · {method.id}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        Sumber: listKioskPaymentMethods — credential aktif + environment + metode tersimpan + filter
        booth.
      </p>
    </section>
  );
}
