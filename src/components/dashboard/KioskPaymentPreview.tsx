"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select } from "@/components/ui/select";
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

const MODE_LABEL: Record<"gateway" | "voucher", string> = {
  gateway: "ONLINE",
  voucher: "OFFLINE",
};

/**
 * KioskPaymentPreview — hasil nyata `listKioskPaymentMethods` untuk satu booth.
 * Bukan estimasi: credential aktif + metode tersimpan + filter `payment_mode`
 * booth + feature gate `cash_payment` semuanya sudah diterapkan server.
 */
export function KioskPaymentPreview({ booths, selectedId, methods, basePath }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeId = selectedId ?? searchParams.get("booth") ?? booths[0]?.id ?? null;

  function selectBooth(id: string) {
    router.replace(`${basePath || pathname}?booth=${id}`, { scroll: false });
  }

  return (
    <section
      aria-labelledby="kiosk-method-preview"
      className="grid gap-3 border-2 border-ink bg-surface p-5 shadow-hard"
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
          <label className="grid gap-1 font-mono text-xs uppercase tracking-[0.08em]">
            Booth
            <Select
              value={activeId ?? ""}
              onChange={(event) => selectBooth(event.target.value)}
              aria-label="Pilih booth"
            >
              {booths.map((booth) => (
                <option key={booth.id} value={booth.id}>
                  {booth.name} · {booth.payment_mode ? MODE_LABEL[booth.payment_mode] : "CASH"}
                </option>
              ))}
            </Select>
          </label>

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
