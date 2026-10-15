"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Check, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PrintPlan, PrintSettingsInput } from "@/lib/print-layout";
import {
  PRINT_DEFAULT_MARGIN_MM,
  printCopies,
  printPageSize,
  shouldAutoPrint,
} from "@/lib/print-layout";
import { useObjectUrls } from "@/components/kiosk/use-object-url";

type Props = {
  photos: { blob: Blob }[];
  plan: PrintPlan;
  /** Setting cetak owner — ukuran/margin/orientasi/salinan/auto-print. */
  printSettings?: PrintSettingsInput | null;
  /** success=true → permintaan print dikirim; browser tidak memberi status fisik. */
  onDone: (success: boolean) => void;
};

type PrintState = "loading" | "ready" | "printing" | "done" | "error";

function waitForImg(img: HTMLImageElement): Promise<void> {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });
}

/**
 * PrintLayoutRenderer — docs/05 §5.15 (window.print, Chrome kiosk --kiosk-printing).
 *
 * Print pipeline: DOM <img> mount → wait all images loaded (complete + naturalWidth>0)
 * → inject @page size sesuai print_settings (4x6/A6 + orientasi + margin) →
 * auto_print ? window.print() langsung : tunggu tombol "Cetak" →
 * afterprint event → onDone(requested).
 *
 * Tablet (Android/iPad): browser tidak bisa silent-print — dialog print sistem
 * selalu muncul; pilih printer foto + ukuran kertas yang sama. Silent tanpa
 * dialog hanya di Chrome desktop flag --kiosk-printing.
 *
 * Retry: increments retryKey → useEffect re-runs full pipeline (re-registers listeners).
 * Always renders "Lanjut" button in non-done states to prevent kiosk-stuck.
 */
function PrintLayoutRendererInner({ photos, plan, printSettings, onDone }: Props) {
  const [state, setState] = useState<PrintState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const doneRef = useRef(false);
  // Guard re-entrancy: "Cetak" dobel-cepat tidak boleh memicu window.print()/listener/onDone dua kali.
  const printingRef = useRef(false);
  const printFnRef = useRef<(() => void) | null>(null);
  const printCleanupRef = useRef<(() => void) | null>(null);

  const auto = shouldAutoPrint(printSettings);
  const copies = printCopies(printSettings);
  const page = printPageSize(printSettings);
  // Satu blob URL per foto final (blob:), di-revoke saat daftar berubah/unmount.
  // Menghindari base64 data URL di DOM print.
  const objectUrls = useObjectUrls(photos.map((p) => p.blob));
  // useObjectUrls membuat URL di dalam effect → commit pertama mengembalikan [].
  // Gerbang kesiapan: tanpa ini pipeline print berjalan atas <img> tanpa src
  // (naturalWidth 0) dan menandai gagal sebelum blob sempat dimuat.
  const urlsReady = objectUrls.length === photos.length && objectUrls.every(Boolean);
  const urlByBlob = new Map<Blob, string>();
  photos.forEach((p, i) => {
    const u = objectUrls[i];
    if (u) urlByBlob.set(p.blob, u);
  });
  // marginMm bisa 0 (owner set 0) → bedakan dari "tidak diset" untuk fallback.
  const marginMm =
    typeof printSettings?.margins_mm === "number" ? page.marginMm : PRINT_DEFAULT_MARGIN_MM;

  useEffect(() => {
    if (plan.kind === "digital") {
      onDone(false);
      return;
    }
    // URL blob belum ada di commit pertama — jalankan pipeline hanya setelah
    // setiap <img> punya src. Efek re-run saat urlsReady berubah.
    if (!urlsReady) return;

    let cancelled = false;
    doneRef.current = false;
    // Retry (retryKey naik) menjalankan ulang effect → buka kunci agar cetak bisa jalan lagi.
    printingRef.current = false;

    // @page presisi per setting owner — SATU sumber geometry (size + margin);
    // meng-override fallback margin-only di globals.css. --print-margin dipakai
    // globals.css untuk max-height (calc(100vh - 2*margin)); default 8mm bila
    // renderer tak ter-mount. Nilai default dari PRINT_DEFAULT_MARGIN_MM (sinkron).
    const style = document.createElement("style");
    style.id = "snapyos-print-css";
    style.textContent =
      `@page { size: ${page.widthMm}mm ${page.heightMm}mm; margin: ${page.marginMm}mm; }` +
      ` :root { --print-margin: ${marginMm}mm; }`;
    document.head.appendChild(style);

    function cleanup() {
      printCleanupRef.current?.();
      printCleanupRef.current = null;
      printFnRef.current = null;
      style.remove();
    }

    function doPrint() {
      if (cancelled || doneRef.current || printingRef.current) return;
      printingRef.current = true;
      setState("printing");

      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const finish = (success: boolean) => {
        if (settled || cancelled || doneRef.current) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        window.removeEventListener("afterprint", handleAfterPrint);
        doneRef.current = success;
        setState(success ? "done" : "error");
        if (success) {
          setTimeout(() => onDone(true), 300);
        } else {
          setErrorMsg("Dialog cetak tidak selesai. Coba lagi atau lanjut tanpa cetak.");
        }
      };
      const handleAfterPrint = () => finish(true);
      window.addEventListener("afterprint", handleAfterPrint);
      timeout = setTimeout(() => finish(false), 15_000);
      printCleanupRef.current = () => {
        if (timeout) clearTimeout(timeout);
        window.removeEventListener("afterprint", handleAfterPrint);
        settled = true;
      };

      try {
        window.print();
      } catch {
        finish(false);
        setErrorMsg("Dialog cetak gagal dibuka.");
      }
    }
    printFnRef.current = doPrint;

    async function prepare() {
      try {
        const allImgs = sheetRefs.current.flatMap((d) =>
          d ? Array.from(d.querySelectorAll<HTMLImageElement>("img.print-photo")) : []
        );

        if (allImgs.length === 0) {
          throw new Error("Tidak ada gambar untuk dicetak.");
        }

        // copies 1–20 menggandakan node <img> (blob URL sama). Browser satu cache
        // per src, jadi cukup tunggu SATU waitForImg per src unik — jauh lebih
        // ringan di tablet dibanding menunggu setiap salinan. <img> tanpa src
        // (blob belum siap) tidak boleh berbagi kunci "" — kalau berbagi, satu
        // gambar yang termuat membuat yang lain lolos gate di bawah.
        const uniqueImgs = new Map<string, HTMLImageElement>();
        for (const [i, img] of allImgs.entries()) {
          const key = img.src || `__missing__:${i}`;
          if (!uniqueImgs.has(key)) uniqueImgs.set(key, img);
        }

        await Promise.all(Array.from(uniqueImgs.values(), (img) => waitForImg(img)));

        if (cancelled) return;

        for (const img of uniqueImgs.values()) {
          if (!img.complete || img.naturalWidth === 0) {
            throw new Error("Gambar belum selesai dimuat.");
          }
        }

        setState("ready");
        await new Promise((r) => setTimeout(r, 150));
        if (cancelled) return;
        // auto_print=false → tunggu tombol "Cetak" (manual, mis. tablet).
        if (auto) doPrint();
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : "Gagal mencetak.");
        setState("error");
      }
    }

    void prepare();

    return () => {
      cancelled = true;
      printingRef.current = false;
      cleanup();
    };
    // printSettings diobjekkan per render — destructure ke primitif agar stabil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey, auto, copies, page.widthMm, page.heightMm, page.marginMm, marginMm, urlsReady]);

  if (plan.kind === "digital") {
    return null;
  }

  const baseSheets =
    plan.kind === "strip"
      ? Array.from({ length: plan.sheets }, () => photos.slice(0, plan.photosPerStrip))
      : plan.photoIndexes.map((idx) => [photos[idx]!]).filter((sheet) => sheet.length > 0);

  // Salinan owner (copies 1–20): duplikasi set lembar N kali.
  const sheetPhotos = Array.from({ length: copies }, () => baseSheets).flat();

  const totalSheets = sheetPhotos.length;

  function handleRetry() {
    setErrorMsg("");
    setState("loading");
    setRetryKey((k) => k + 1);
  }

  function handleManualPrint() {
    printFnRef.current?.();
  }

  function handleSkip() {
    // Jangan biarkan customer melewati saat cetak sedang berjalan — kalau tidak,
    // hasil bisa keluar setelah sesi sudah di-reset untuk customer berikutnya.
    if (doneRef.current || state === "printing") return;
    doneRef.current = true;
    setState("done");
    onDone(false);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-bg p-8 text-center">
        {state === "error" ? (
          <>
            <TriangleAlert className="size-12 text-destructive" aria-hidden />
            <p className="font-display text-2xl uppercase leading-none tracking-tight">Gagal mencetak</p>
            <p className="max-w-[40ch] font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
              {errorMsg || "Terjadi kesalahan saat mencetak."}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" size="lg" onClick={handleRetry}>
                Coba lagi
              </Button>
              <Button size="lg" className="bg-accent" onClick={handleSkip}>
                Lanjut
              </Button>
            </div>
          </>
        ) : state === "done" ? (
          <>
            <Check className="size-12 text-accent-3" aria-hidden />
            <p className="font-display text-2xl uppercase leading-none tracking-tight">Permintaan cetak dikirim</p>
          </>
        ) : state === "ready" && !auto ? (
          <>
            <Printer className="size-12" aria-hidden />
            <p className="font-display text-2xl uppercase leading-none tracking-tight">Siap dicetak</p>
            <p className="max-w-[44ch] font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              {`/// ${totalSheets} LEMBAR · DI TABLET PILIH PRINTER FOTO DI DIALOG SISTEM`}
            </p>
            <div className="flex gap-3">
              <Button size="lg" className="bg-accent" onClick={handleManualPrint}>
                <Printer className="size-5" aria-hidden /> Cetak {totalSheets} lembar
              </Button>
              <Button size="lg" variant="outline" onClick={handleSkip}>
                Lanjut
              </Button>
            </div>
          </>
        ) : (
          <>
            <Printer className="size-12 animate-pulse" aria-hidden />
            <p className="font-display text-2xl uppercase leading-none tracking-tight">
              {state === "ready" ? "Mencetak…" : "Menyiapkan…"}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              {`/// ${totalSheets} LEMBAR: ${plan.kind.toUpperCase()}`}
            </p>
            <Button size="lg" variant="outline" onClick={handleSkip}>
              Lanjut
            </Button>
          </>
        )}
      </div>

      <div aria-hidden className="hidden print:block">
        {sheetPhotos.map((sheet, i) => (
          <div
            key={`${i}-${retryKey}`}
            ref={(el) => {
              sheetRefs.current[i] = el;
            }}
            className="print-sheet"
          >
            {sheet.map((p, j) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={j} src={urlByBlob.get(p.blob)} alt="" className="print-photo" />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/** memo: props stabil dari KioskApp — print pipeline tak re-run akibat render induk. */
export const PrintLayoutRenderer = memo(PrintLayoutRendererInner);
