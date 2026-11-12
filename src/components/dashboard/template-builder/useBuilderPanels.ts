"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "snapyos.builder.panels";

export type BuilderPanels = { left: boolean; right: boolean };

const DEFAULT_PANELS: BuilderPanels = { left: true, right: true };

/**
 * Visibilitas panel kiri/kanan builder. Default keduanya terbuka; nilai
 * tersimpan dibaca SETELAH mount agar markup server dan klien identik
 * (menghindari hydration mismatch), lalu ditulis ulang setiap toggle.
 */
export function useBuilderPanels() {
  const [panels, setPanels] = useState<BuilderPanels>(DEFAULT_PANELS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<BuilderPanels> | null;
      if (!parsed || typeof parsed !== "object") return;
      const next = { left: parsed.left !== false, right: parsed.right !== false };
      const seed = requestAnimationFrame(() => setPanels(next));
      return () => cancelAnimationFrame(seed);
    } catch {
      // localStorage tidak tersedia / JSON rusak → pakai default.
    }
  }, []);

  const update = useCallback((updater: (prev: BuilderPanels) => BuilderPanels) => {
    setPanels((prev) => {
      const next = updater(prev);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Mode privat / kuota penuh: state tetap hidup di memori.
      }
      return next;
    });
  }, []);

  const toggleLeft = useCallback(() => update((prev) => ({ ...prev, left: !prev.left })), [update]);
  const toggleRight = useCallback(
    () => update((prev) => ({ ...prev, right: !prev.right })),
    [update]
  );

  return { left: panels.left, right: panels.right, toggleLeft, toggleRight };
}
