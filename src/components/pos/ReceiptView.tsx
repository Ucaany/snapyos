"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bluetooth, Loader2, Printer, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/dashboard-math";
import { shouldAutoPrintReceipt } from "@/lib/pos-receipt-settings";
import {
  autoPrintStorageKey,
  claimAutoPrintAttempt,
  getAutoPrintStore,
} from "@/lib/print/auto-print";
import { encodeReceipt, receiptLines } from "@/lib/print/receipt";
import { BluetoothPrintError, connectEscPos, requestEscPosDevice } from "@/lib/print/bluetooth";
import { enableCupsPrinter, fetchPrinterStatus, submitCupsReceipt } from "@/lib/print/cups";
import { SerialPrintError, writeEscPosSerial, writeEscPosSerialGranted } from "@/lib/print/serial";
import { usePrintTransport } from "@/hooks/use-print-transport";
import type { PosOrderDetail } from "@/server/pos-orders";

const METHOD_LABEL: Record<string, string> = {
  cash: "TUNAI",
  bank_transfer: "TRANSFER BANK",
  other: "LAINNYA",
};

/**
 * ReceiptView — struk siap-cetak.
 *
 * Dua jalur: dialog sistem (`window.print`) dan thermal ESC/POS lewat Web
 * Bluetooth. Printer Bluetooth hanya mengirim perintah; hasil fisik tetap
 * dikonfirmasi kasir.
 */
export function ReceiptView({
  detail,
  businessName,
}: {
  detail: PosOrderDetail;
  businessName: string;
}) {
  const router = useRouter();
  const { order, items } = detail;
  const [btState, setBtState] = useState<"idle" | "printing" | "sent" | "error">("idle");
  const [btMessage, setBtMessage] = useState<string | null>(null);
  const [lastTransport, setLastTransport] = useState<"bluetooth" | "serial" | "cups" | null>(null);
  const [autoPrintPending, setAutoPrintPending] = useState(false);
  const autoPrintRan = useRef(false);
  // Strict Mode me-mount effect dua kali: cleanup run pertama menandai job
  // "cancelled" padahal write sudah terkirim, sehingga status `sent` tidak
  // pernah dirender dan banner "Mengirim…" menggantung selamanya. Ref alive
  // hanya false saat komponen benar-benar unmount.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const transport = usePrintTransport();
  const btSupported = transport.bluetooth;
  const serialSupported = transport.serial;
  const paidAt = new Date(order.paid_at ?? order.created_at).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "short",
    timeStyle: "short",
  });
  const paperWidthMm = order.paper_width_mm ?? 80;
  // Owner mematikan jalur struk → tombol cetak disembunyikan, bukan error.
  const canPrint = order.receipt_enabled;
  // `cups` = bridge lokal memegang printer; struk dikirim sebagai teks PDF
  // gulungan 58/80mm lewat rute teks bridge.
  const cupsMode = order.print_mode === "cups";

  function receiptData() {
    return {
      businessName,
      orderNumber: order.number,
      methodLabel: METHOD_LABEL[order.payment_method] ?? order.payment_method.toUpperCase(),
      boothName: order.photobox_name,
      outletName: order.outlet_name,
      cashierName: order.cashier_name,
      paidAt,
      items: items.map((item) => ({
        name: item.name_snapshot,
        quantity: item.quantity,
        unitPrice: item.unit_price_snapshot,
        subtotal: item.subtotal,
      })),
      grossAmount: order.gross_amount,
      discountAmount: order.discount_amount,
      finalAmount: order.final_amount,
      amountReceived: order.amount_received,
      changeAmount: order.change_amount,
    };
  }

  function receiptBytes() {
    return encodeReceipt(receiptData(), paperWidthMm);
  }

  /** Jalur CUPS: teks struk yang sama, bukan jalur dialog sekunder. */
  async function printCups() {
    setBtState("printing");
    setBtMessage(null);
    setLastTransport("cups");
    try {
      const settings = { printer_name: order.printer_name_setting, bridge_url: order.bridge_url };
      const status = await fetchPrinterStatus(settings, order.printer_name_setting || undefined);
      if (status?.state === "offline") {
        throw new Error(
          `Printer ${status.printer || "default"} offline. Periksa kabel dan kertas struk.`
        );
      }
      if (status?.state === "disabled") {
        const enabled = await enableCupsPrinter(settings, order.printer_name_setting || undefined);
        if (!enabled?.ok) {
          throw new Error(`Printer ${status.printer || "default"} disabled dan gagal diaktifkan.`);
        }
      }
      await submitCupsReceipt(
        settings,
        {
          title: `STRUK ${order.number}`,
          lines: receiptLines(receiptData(), paperWidthMm),
          paperWidthMm,
        }
      );
      setBtState("sent");
    } catch (error) {
      setBtMessage(error instanceof Error ? error.message : "Gagal mengirim struk ke CUPS.");
      setBtState("error");
    }
  }

  async function printBluetooth() {
    setBtState("printing");
    setBtMessage(null);
    setLastTransport("bluetooth");
    try {
      const device = await requestEscPosDevice();
      const link = await connectEscPos(device);
      try {
        await link.write(receiptBytes());
        setBtState("sent");
      } finally {
        link.disconnect();
      }
    } catch (error) {
      if (error instanceof BluetoothPrintError && error.code === "NO_DEVICE") {
        setBtState("idle");
        return;
      }
      setBtMessage(
        error instanceof BluetoothPrintError
          ? error.message
          : "Gagal mengirim struk ke printer Bluetooth."
      );
      setBtState("error");
    }
  }

  /** Printer Classic SPP: koneksi lewat Web Serial (Chrome desktop). */
  async function printSerial() {
    setBtState("printing");
    setBtMessage(null);
    setLastTransport("serial");
    try {
      await writeEscPosSerial(receiptBytes());
      setBtState("sent");
    } catch (error) {
      if (error instanceof SerialPrintError && error.code === "NO_PORT") {
        setBtState("idle");
        return;
      }
      setBtMessage(
        error instanceof SerialPrintError ? error.message : "Gagal mengirim struk lewat Web Serial."
      );
      setBtState("error");
    }
  }

  // Auto-print struk: hanya sekali per order per sesi browser. Memakai port
  // yang sudah diizinkan (Web Serial) atau device BLE yang pernah dipilih;
  // tanpa izin, tombol manual tetap jadi jalur pairing pertama.
  useEffect(() => {
    if (autoPrintRan.current) return;
    if (!canPrint || !shouldAutoPrintReceipt(order)) return;
    autoPrintRan.current = true;
    // Claim SEBELUM mengirim. Reload setelah job terkirim tidak boleh mencetak
    // ulang otomatis (struk ganda); tombol manual tetap tersedia.
    if (!claimAutoPrintAttempt(autoPrintStorageKey("pos", order.id), getAutoPrintStore())) return;

    void (async () => {
      setAutoPrintPending(true);
      setLastTransport("serial");
      try {
        const sent = await writeEscPosSerialGranted(receiptBytes());
        // Status terminal HARUS selalu dirender: kalau write sudah terkirim,
        // banner "Mengirim…" yang tertinggal membuat kasir mengira job macet.
        if (sent) {
          setBtState("sent");
          return;
        }
        if (!transport.bluetooth) {
          setBtMessage(
            "Auto-print menunggu izin printer. Klik Cetak SPP sekali untuk menghubungkan."
          );
          return;
        }
        const { reconnectGranted } = await import("@/lib/print/bluetooth");
        const device = await reconnectGranted();
        if (!device || !aliveRef.current) {
          setBtMessage(
            "Auto-print menunggu izin printer. Klik Cetak Bluetooth sekali untuk menghubungkan."
          );
          return;
        }
        setLastTransport("bluetooth");
        const link = await connectEscPos(device);
        try {
          await link.write(receiptBytes());
          if (aliveRef.current) setBtState("sent");
        } finally {
          link.disconnect();
        }
      } catch (error) {
        // Auto-print yang gagal harus terlihat sebagai error + tombol coba lagi;
        // sebelumnya hanya pesan status sehingga kasir tidak tahu job berhenti.
        setBtState("error");
        setBtMessage(
          error instanceof SerialPrintError || error instanceof BluetoothPrintError
            ? error.message
            : "Auto-print gagal. Gunakan tombol cetak manual."
        );
      } finally {
        setAutoPrintPending(false);
      }
    })();
    // Sekali saat struk dibuka; receiptBytes mengikuti detail order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPrint, order.id]);

  return (
    <div className="print-root mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-6 p-4 md:p-8 print:mx-0 print:min-h-0 print:w-full print:max-w-none print:p-0">
      <div className={canPrint ? "flex flex-col gap-3 print:hidden" : "hidden print:hidden"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push("/pos")}>
            <RotateCcw aria-hidden />
            Transaksi baru
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer aria-hidden />
              Cetak dialog
            </Button>
            {btSupported && (
              <Button
                size="sm"
                onClick={() => void printBluetooth()}
                disabled={btState === "printing"}
              >
                {btState === "printing" ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Bluetooth aria-hidden />
                )}
                {btState === "printing" ? "Mengirim…" : "Cetak Bluetooth"}
              </Button>
            )}
            {serialSupported && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void printSerial()}
                disabled={btState === "printing"}
              >
                {btState === "printing" ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Bluetooth aria-hidden />
                )}
                Cetak SPP
              </Button>
            )}
            {cupsMode && (
              <Button size="sm" onClick={() => void printCups()} disabled={btState === "printing"}>
                {btState === "printing" && lastTransport === "cups" ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Printer aria-hidden />
                )}
                Cetak CUPS
              </Button>
            )}
          </div>
        </div>
        {btState === "sent" && (
          <p
            role="status"
            className="border-2 border-accent-3 bg-accent-3/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em]"
          >
            Perintah struk terkirim. Periksa hasil cetak fisik.
          </p>
        )}
        {autoPrintPending && (
          <p
            role="status"
            className="border-2 border-ink/30 bg-surface px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em]"
          >
            Auto-print: mengirim struk ke printer…
          </p>
        )}
        {btMessage && btState !== "error" && (
          <p
            role="status"
            className="border-2 border-accent bg-accent/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em]"
          >
            {btMessage}
          </p>
        )}
        {btState === "error" && (
          <div
            role="alert"
            className="flex flex-col gap-2 border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em]"
          >
            <p>{btMessage ?? "Printer Bluetooth gagal."}</p>
            <button
              type="button"
              onClick={() =>
                void (lastTransport === "cups"
                  ? printCups()
                  : lastTransport === "serial"
                    ? printSerial()
                    : printBluetooth())
              }
              className="min-h-11 w-full border-2 border-ink bg-surface px-3 font-mono text-xs font-bold uppercase tracking-[0.05em] text-ink shadow-[2px_2px_0_0_#111111] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Coba lagi
            </button>
          </div>
        )}
      </div>

      <article className="flex flex-col gap-4 border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111] print:border-0 print:shadow-none">
        <header className="flex flex-col gap-1 border-b-2 border-ink pb-4 text-center">
          <p className="font-display text-xl uppercase tracking-tight">{businessName}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            STRUK PENJUALAN POS
          </p>
        </header>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.08em]">
          <div>
            <dt className="text-muted-foreground">No. order</dt>
            <dd className="font-bold">{order.number}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Metode</dt>
            <dd className="font-bold">
              {METHOD_LABEL[order.payment_method] ?? order.payment_method}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Booth</dt>
            <dd className="font-bold">{order.photobox_name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Outlet</dt>
            <dd className="font-bold">{order.outlet_name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Kasir</dt>
            <dd className="font-bold">{order.cashier_name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Waktu</dt>
            <dd className="font-bold">{paidAt}</dd>
          </div>
        </dl>

        <table className="border-collapse border-t-2 border-ink font-mono text-xs">
          <caption className="sr-only">Item pembelian</caption>
          <thead>
            <tr className="border-b-2 border-ink text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th scope="col" className="py-2">
                Item
              </th>
              <th scope="col" className="py-2 text-right">
                Qty
              </th>
              <th scope="col" className="py-2 text-right">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-ink/10">
                <td className="py-2 pr-2 font-bold uppercase leading-snug">{item.name_snapshot}</td>
                <td className="py-2 text-right">×{item.quantity}</td>
                <td className="py-2 text-right font-bold">{formatIDR(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="flex flex-col gap-1 border-t-2 border-ink pt-3 font-mono text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Subtotal
            </dt>
            <dd>{formatIDR(order.gross_amount)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Diskon
            </dt>
            <dd>{formatIDR(order.discount_amount)}</dd>
          </div>
          <div className="flex items-center justify-between border-t-2 border-ink pt-2">
            <dt className="text-[10px] font-bold uppercase tracking-[0.15em]">Total</dt>
            <dd className="text-lg font-bold">{formatIDR(order.final_amount)}</dd>
          </div>
          {order.amount_received !== null && (
            <>
              <div className="flex items-center justify-between">
                <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Tunai
                </dt>
                <dd>{formatIDR(order.amount_received)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Kembali
                </dt>
                <dd className="font-bold">
                  {formatIDR(order.change_amount ?? order.amount_received - order.final_amount)}
                </dd>
              </div>
            </>
          )}
        </dl>

        <footer className="border-t-2 border-dashed border-ink/30 pt-3 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Terima kasih. SnapyOS POS
          </p>
        </footer>
      </article>
    </div>
  );
}
