"use client";

import { useCallback, useState } from "react";

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

export type CanvasViewport = {
  zoom: number;
  panX: number;
  panY: number;
  setZoom: (value: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Kembalikan zoom 100% + pan 0. */
  reset: () => void;
  /** Skala agar seluruh kanvas pas di area tampil. */
  fit: (
    canvas: { width: number; height: number },
    container: { width: number; height: number }
  ) => void;
  panBy: (dx: number, dy: number) => void;
};

const clampZoom = (value: number) =>
  Number.isFinite(value) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) : 1;

/**
 * Zoom (25–400%) + pan viewport kanvas builder. Disimpan sebagai faktor, bukan
 * skala piksel, sehingga resize jendela tidak merusak state.
 */
export function useCanvasViewport(): CanvasViewport {
  const [zoom, setZoomState] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const setZoom = useCallback((value: number) => setZoomState(clampZoom(value)), []);
  const zoomIn = useCallback(() => setZoomState((z) => clampZoom(z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoomState((z) => clampZoom(z - ZOOM_STEP)), []);

  const reset = useCallback(() => {
    setZoomState(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const fit = useCallback(
    (canvas: { width: number; height: number }, container: { width: number; height: number }) => {
      if (canvas.width <= 0 || canvas.height <= 0) return;
      if (container.width <= 0 || container.height <= 0) return;
      setPan({ x: 0, y: 0 });
      setZoomState(
        clampZoom(Math.min(container.width / canvas.width, container.height / canvas.height))
      );
    },
    []
  );

  const panBy = useCallback((dx: number, dy: number) => {
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  return { zoom, panX: pan.x, panY: pan.y, setZoom, zoomIn, zoomOut, reset, fit, panBy };
}
