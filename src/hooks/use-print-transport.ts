"use client";

import { useSyncExternalStore } from "react";

import { isBluetoothPrintSupported } from "@/lib/print/bluetooth";
import { isSerialPrintSupported } from "@/lib/print/serial";

const noopSubscribe = () => () => undefined;

/**
 * Deteksi transport cetak SETELAH hidrasi.
 *
 * `navigator.bluetooth`/`navigator.serial` tidak ada saat SSR, sehingga
 * membaca nilainya langsung di render menghasilkan markup server (tombol
 * tersembunyi) berbeda dari client (tombol tampil) dan memicu hydration error.
 * Snapshot server selalu `false`; client baru melaporkan kemampuan asli.
 */
export function usePrintTransport(): { bluetooth: boolean; serial: boolean; ready: boolean } {
  const ready = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  return {
    ready,
    bluetooth: ready && isBluetoothPrintSupported(),
    serial: ready && isSerialPrintSupported(),
  };
}
