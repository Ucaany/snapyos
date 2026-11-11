import type {
  CameraSettings,
  KioskBrandingConfig,
  KioskPageId,
  KioskVisualStyle,
} from "./kiosk-types.ts";
import { kioskVisualStyle } from "./kiosk-types.ts";
import { normalizeRotation, normalizeZoom } from "./camera-capture.ts";

export const KIOSK_SCREEN_IDS = [
  "welcome",
  "guide",
  "package",
  "payment",
  "template",
  "capture",
  "review",
  "editor",
  "printing",
  "result",
  "offline",
  "error",
  "maintenance",
] as const;

export type KioskScreenId = (typeof KIOSK_SCREEN_IDS)[number];
export type KioskOrientation = "portrait" | "landscape";
export type KioskScreenState =
  "ready" | "loading" | "empty" | "error" | "offline" | "maintenance" | "fallback";

export type KioskSafeArea = {
  top: string;
  right: string;
  bottom: string;
  left: string;
};

export type KioskScreenDefinition = {
  id: KioskScreenId;
  label: string;
  customerVisible: true;
  page: KioskPageId | null;
  fallback: KioskScreenId;
  layout:
    | "welcome"
    | "guide"
    | "selection"
    | "payment"
    | "capture"
    | "review"
    | "editor"
    | "printing"
    | "result"
    | "state";
};

export type KioskScreenConfig = KioskVisualStyle & {
  schemaVersion: 1;
  screen: KioskScreenId;
  orientation: KioskOrientation;
  layout: KioskScreenDefinition["layout"];
  safeArea: KioskSafeArea;
  state: KioskScreenState;
  isFallback: boolean;
  cameraCalibration: {
    rotationDegrees: 0 | 90 | 180 | 270;
    zoom: number;
  };
  minTouchTarget: 44;
};

const PAGE_FOR_SCREEN: Record<KioskScreenId, KioskPageId | null> = {
  welcome: "welcome",
  guide: "guide",
  package: "package",
  payment: "payment",
  template: "template",
  capture: "capture",
  review: "capture",
  editor: "edit",
  printing: "result",
  result: "result",
  offline: null,
  error: null,
  maintenance: null,
};

const REGISTRY: Record<KioskScreenId, KioskScreenDefinition> = {
  welcome: {
    id: "welcome",
    label: "Beranda",
    customerVisible: true,
    page: "welcome",
    fallback: "error",
    layout: "welcome",
  },

  guide: {
    id: "guide",
    label: "Petunjuk",
    customerVisible: true,
    page: "guide",
    fallback: "error",
    layout: "guide",
  },
  package: {
    id: "package",
    label: "Paket",
    customerVisible: true,
    page: "package",
    fallback: "error",
    layout: "selection",
  },
  payment: {
    id: "payment",
    label: "Pembayaran",
    customerVisible: true,
    page: "payment",
    fallback: "offline",
    layout: "payment",
  },
  template: {
    id: "template",
    label: "Frame",
    customerVisible: true,
    page: "template",
    fallback: "error",
    layout: "selection",
  },
  capture: {
    id: "capture",
    label: "Ambil foto",
    customerVisible: true,
    page: "capture",
    fallback: "error",
    layout: "capture",
  },
  review: {
    id: "review",
    label: "Cek foto",
    customerVisible: true,
    page: "capture",
    fallback: "capture",
    layout: "review",
  },
  editor: {
    id: "editor",
    label: "Edit foto",
    customerVisible: true,
    page: "edit",
    fallback: "error",
    layout: "editor",
  },
  printing: {
    id: "printing",
    label: "Mencetak",
    customerVisible: true,
    page: "result",
    fallback: "error",
    layout: "printing",
  },
  result: {
    id: "result",
    label: "Hasil",
    customerVisible: true,
    page: "result",
    fallback: "error",
    layout: "result",
  },
  offline: {
    id: "offline",
    label: "Offline",
    customerVisible: true,
    page: null,
    fallback: "offline",
    layout: "state",
  },
  error: {
    id: "error",
    label: "Gangguan",
    customerVisible: true,
    page: null,
    fallback: "error",
    layout: "state",
  },
  maintenance: {
    id: "maintenance",
    label: "Perawatan",
    customerVisible: true,
    page: null,
    fallback: "maintenance",
    layout: "state",
  },
};

export const KIOSK_SCREEN_REGISTRY: readonly KioskScreenDefinition[] = KIOSK_SCREEN_IDS.map(
  (id) => REGISTRY[id]
);

export function getKioskScreenDefinition(screen: KioskScreenId): KioskScreenDefinition {
  return REGISTRY[screen];
}

export function screenToKioskPageId(screen: KioskScreenId): KioskPageId | null {
  return PAGE_FOR_SCREEN[screen];
}

export function normalizeKioskScreenId(value: string): KioskScreenId | null {
  if (value === "edit") return "editor";
  return (KIOSK_SCREEN_IDS as readonly string[]).includes(value) ? (value as KioskScreenId) : null;
}

export function resolveKioskOrientation(
  configured: KioskOrientation | null | undefined,
  viewport?: { width: number; height: number }
): KioskOrientation {
  if (configured) return configured;
  return viewport && viewport.height > viewport.width ? "portrait" : "landscape";
}

export function normalizeCameraCalibration(
  camera?: CameraSettings | null
): KioskScreenConfig["cameraCalibration"] {
  return {
    rotationDegrees: normalizeRotation(camera?.rotation_degrees),
    zoom: normalizeZoom(camera?.zoom),
  };
}

function safeArea(): KioskSafeArea {
  return {
    top: "env(safe-area-inset-top, 0px)",
    right: "env(safe-area-inset-right, 0px)",
    bottom: "env(safe-area-inset-bottom, 0px)",
    left: "env(safe-area-inset-left, 0px)",
  };
}

export function resolveKioskScreenConfig(input: {
  screen: KioskScreenId;
  kiosk?: KioskBrandingConfig;
  brand?: { primary?: string | null; secondary?: string | null };
  orientation?: KioskOrientation | null;
  camera?: CameraSettings | null;
  viewport?: { width: number; height: number };
}): KioskScreenConfig {
  const definition = getKioskScreenDefinition(input.screen);
  const orientation = resolveKioskOrientation(input.orientation, input.viewport);
  const style = kioskVisualStyle(input.kiosk, definition.page ?? undefined, input.brand);
  return {
    ...style,
    schemaVersion: 1,
    screen: input.screen,
    orientation,
    layout: definition.layout,
    safeArea: safeArea(),
    state: "ready",
    isFallback: false,
    cameraCalibration: normalizeCameraCalibration(input.camera),
    minTouchTarget: 44,
  };
}
