"use client";

import { useEffect, useState } from "react";
import { Printer, ReceiptText } from "lucide-react";
import { PrintLayoutRenderer } from "@/components/kiosk/PrintLayoutRenderer";
import { BluetoothPrintScreen } from "@/components/kiosk/BluetoothPrintScreen";
import { CupsPrintScreen } from "@/components/kiosk/CupsPrintScreen";
import { Button } from "@/components/ui/button";
import {
  availablePrintPaths,
  isPrintPathEnabled,
  resolvePrintMode,
  resolvePurposeSettings,
  type PrintModeInput,
  type PrintPurpose,
} from "@/lib/print/print-mode";
import { stampQr } from "@/lib/print/qr-stamp";
import type { PrintPlan } from "@/lib/print-layout";

type Props = {
  photos: { blob: Blob }[];
  plan: PrintPlan;
  printSettings?: PrintModeInput | null;
  /**
   * `photo` = layar hasil kiosk (boleh memilih foto atau thermal),
   * `thermal` = paksa jalur ESC/POS,
   * `receipt` = gerbang struk POS (`receipt.enabled`); renderer struk tetap
   * `ReceiptView`, jadi komponen ini hanya menegakkan sakelarnya.
   */
  purpose?: PrintPurpose;
  /** ID sesi untuk dedupe auto-print (dipakai jalur thermal/CUPS). */
  jobId?: string;
  /** true = customer menekan "Cetak ulang"; jangan pakai guard auto-print. */
  reprint?: boolean;
  /** Lembar berframe/composite (fit auto → contain). */
  framed?: boolean;
  /** Rasio kanvas untuk orientation=auto. */
  canvasAspect?: number | null;
  /** URL hasil (`/r/[token]`) yang dicetak sebagai QR di lembar foto. */
  resultUrl?: string | null;
  /** success=true → permintaan cetak terkirim (browser tidak memberi status fisik). */
  onDone: (success: boolean) => void;
};

/**
 * Dispatcher cetak: memilih jalur sesuai `print_settings`.
 *
 * `purpose` menentukan grup setelan yang dibaca (`photo`/`thermal`),
 * dan grup itu juga jadi fallback field datar untuk baris lama.
 *
 * Untuk hasil foto, booth boleh punya DUA jalur aktif bersamaan (printer foto
 * + thermal). Bila keduanya tersedia, customer memilih; bila hanya satu,
 * jalur itu langsung dipakai supaya auto-print tidak berubah.
 *
 * Gerbang `enabled` ditegakkan DI SINI, bukan hanya di KioskApp: satu renderer
 * yang dipanggil langsung (mis. panel test) tidak boleh mencetak saat owner
 * mematikan jalurnya.
 */
export function PrintFlow({
  photos,
  plan,
  printSettings,
  purpose = "photo",
  jobId,
  reprint = false,
  framed = false,
  canvasAspect = null,
  resultUrl = null,
  onDone,
}: Props) {
  const [forceBrowser, setForceBrowser] = useState(false);
  const [chosen, setChosen] = useState<PrintPurpose | null>(null);
  // Foto + QR hasil (`/r/[token]`). Hasil stempel disimpan bersama kunci
  // masukannya supaya render bisa tahu apakah cache masih segar TANPA
  // setState sinkron di dalam effect (memicu render berantai).
  const qrUrl = resultUrl?.trim() ?? "";
  const [cache, setCache] = useState<{
    url: string;
    photos: { blob: Blob }[];
    out: { blob: Blob }[];
  } | null>(null);
  const stale =
    qrUrl.length > 0 &&
    (cache?.url !== qrUrl ||
      cache.photos.length !== photos.length ||
      cache.photos.some((photo, index) => photo.blob !== photos[index]?.blob));

  useEffect(() => {
    if (!qrUrl || photos.length === 0 || !stale) return;
    let cancelled = false;
    void (async () => {
      const out = await Promise.all(
        photos.map(async (photo) => ({ blob: await stampQr(photo.blob, qrUrl) }))
      );
      if (!cancelled) setCache({ url: qrUrl, photos, out });
    })();
    return () => {
      cancelled = true;
    };
  }, [qrUrl, photos, stale]);

  // Selama QR belum selesai, jangan kirim lembar tanpa QR ke printer.
  const printPhotos = qrUrl.length > 0 ? (cache && !stale ? cache.out : null) : photos;

  // Struk POS dirender `ReceiptView`; di sini hanya gerbang `receipt.enabled`
  // supaya renderer tunggal pun tidak bisa mencetak saat owner mematikannya.
  if (purpose === "receipt") {
    return isPrintPathEnabled(printSettings, "receipt") ? null : (
      <PrintUnavailable onSkip={() => onDone(false)} />
    );
  }

  const paths = availablePrintPaths(printSettings);
  const available: PrintPurpose[] = purpose === "thermal" ? [] : paths;
  if (purpose === "thermal" && paths.includes("thermal")) available.push("thermal");

  const active: PrintPurpose | null =
    chosen && available.includes(chosen) ? chosen : available.length === 1 ? available[0]! : null;

  if (!active) {
    // Dua jalur tersedia → pilihan eksplisit. Tidak ada jalur → berhenti dengan
    // pesan, bukan diam-diam memakai dialog OS yang tidak dikonfigurasi.
    if (available.length > 1) {
      return <PrintChoice onChoose={setChosen} onSkip={() => onDone(false)} />;
    }
    return <PrintUnavailable onSkip={() => onDone(false)} />;
  }

  const settings = resolvePurposeSettings(printSettings, active);
  const mode = resolvePrintMode(printSettings, active);
  // Mode bluetooth TIDAK pernah turun sendiri ke dialog foto: perangkat tanpa
  // Web Bluetooth/Serial memakai layar Bluetooth yang memberi pilihan eksplisit
  // "Cetak lewat dialog". Diam-diam pindah printer = struk foto salah jalur.
  const useBrowser = mode !== "bluetooth" || forceBrowser;

  // QR belum selesai ditempel → tunggu; jangan kirim lembar tanpa QR.
  if (!printPhotos) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
        <Printer className="size-10 motion-safe:animate-pulse" aria-hidden />
        <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
          Menyiapkan lembar
        </p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Menempelkan QR hasil
        </p>
      </div>
    );
  }

  if (!useBrowser) {
    return (
      <BluetoothPrintScreen
        photos={printPhotos}
        plan={plan}
        printSettings={settings}
        jobId={jobId}
        reprint={reprint}
        onDone={onDone}
        onUseBrowserPrint={() => setForceBrowser(true)}
      />
    );
  }

  if (mode === "cups") {
    return (
      <CupsPrintScreen
        photos={printPhotos}
        plan={plan}
        printSettings={settings}
        jobId={jobId}
        reprint={reprint}
        framed={framed}
        canvasAspect={canvasAspect}
        onDone={onDone}
      />
    );
  }

  return (
    <PrintLayoutRenderer
      photos={printPhotos}
      plan={plan}
      printSettings={settings}
      jobId={jobId}
      reprint={reprint}
      framed={framed}
      canvasAspect={canvasAspect}
      onDone={onDone}
    />
  );
}

function PrintChoice({
  onChoose,
  onSkip,
}: {
  onChoose: (purpose: "photo" | "thermal") => void;
  onSkip: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-bg p-6 text-center md:p-8">
      <Printer className="size-10 shrink-0" aria-hidden />
      <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
        Pilih jenis cetak
      </p>
      <p className="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
        Booth ini punya printer foto dan printer thermal. Pilih salah satu.
      </p>
      <div className="flex flex-wrap justify-center gap-2.5">
        <Button size="lg" className="bg-accent" onClick={() => onChoose("photo")}>
          <Printer className="size-5" aria-hidden /> Cetak foto
        </Button>
        <Button size="lg" variant="outline" onClick={() => onChoose("thermal")}>
          <ReceiptText className="size-5" aria-hidden /> Cetak thermal
        </Button>
        <Button size="lg" variant="ghost" onClick={onSkip}>
          Lanjut
        </Button>
      </div>
    </div>
  );
}

function PrintUnavailable({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-bg p-6 text-center md:p-8">
      <Printer className="size-10 shrink-0 text-muted-foreground" aria-hidden />
      <p className="font-display text-xl uppercase leading-none tracking-[-0.02em] md:text-2xl">
        Cetak tidak tersedia
      </p>
      <p className="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
        Jalur cetak booth ini dimatikan owner atau perangkatnya tidak mendukung. Hasil digital tetap
        bisa diambil lewat QR.
      </p>
      <Button size="lg" onClick={onSkip}>
        Lanjut
      </Button>
    </div>
  );
}
