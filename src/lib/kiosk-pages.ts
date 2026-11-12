/**
 * Sumber tunggal pemetaan halaman kiosk → label → screen.
 * Client-safe (tanpa "server-only") agar dipakai editor dan pratinjau sekaligus.
 */

import type { KioskPageId } from "./kiosk-types.ts";
import type { KioskScreenId } from "./kiosk-screen-registry.ts";

export type KioskPageOption = {
  id: KioskPageId;
  label: string;
  screen: KioskScreenId;
};

export const KIOSK_PAGE_OPTIONS: readonly KioskPageOption[] = [
  { id: "welcome", label: "Sambutan", screen: "welcome" },
  { id: "guide", label: "Petunjuk", screen: "guide" },
  { id: "package", label: "Paket", screen: "package" },
  { id: "payment", label: "Pembayaran", screen: "payment" },
  { id: "template", label: "Template", screen: "template" },
  { id: "capture", label: "Ambil foto", screen: "capture" },
  { id: "edit", label: "Sunting", screen: "editor" },
  { id: "result", label: "Hasil", screen: "result" },
];
