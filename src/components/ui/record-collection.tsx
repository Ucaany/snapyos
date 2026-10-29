"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { LayoutGrid, List, Pencil, type LucideIcon } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

export type ViewMode = "list" | "grid";

type RecordCollectionContextValue = {
  mode: ViewMode | null;
  setMode: (mode: ViewMode) => void;
};

const RecordCollectionContext = createContext<RecordCollectionContextValue | null>(null);

export function useRecordCollection(): RecordCollectionContextValue {
  const value = useContext(RecordCollectionContext);
  if (!value) {
    throw new Error("useRecordCollection harus dipakai di dalam RecordCollection.");
  }
  return value;
}

/**
 * RecordCollection - pemilih tampilan daftar/grid untuk halaman list.
 *
 * Kedua tampilan dirender server lalu disembunyikan dengan CSS, bukan
 * di-mount ulang. Render pertama memakai default mobile (grid) atau desktop
 * (list), lalu preferensi localStorage diterapkan setelah mount supaya tidak
 * ada hydration mismatch. Preferensi disimpan per fitur:
 * `snapyos.view.<feature>`.
 */
export function RecordCollection({
  storageKey,
  list,
  grid,
  label = "Daftar data",
  mobileDefault = "grid",
}: {
  storageKey: string;
  list: ReactNode;
  grid: ReactNode;
  label?: string;
  mobileDefault?: ViewMode;
}) {
  // Dialog preferensi dibaca lewat store (bukan effect): nilai server `null`
  // menjaga kelas awal tetap sama saat hydration, lalu browser mengisi mode
  // nyata setelah mount. Tidak ada setState di dalam effect.
  const [override, setOverride] = useState<ViewMode | null>(null);

  const subscribeMode = useCallback(
    (listener: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === storageKey) listener();
      };
      const media = window.matchMedia("(max-width: 767px)");
      window.addEventListener("storage", onStorage);
      media.addEventListener("change", listener);
      return () => {
        window.removeEventListener("storage", onStorage);
        media.removeEventListener("change", listener);
      };
    },
    [storageKey]
  );

  const readMode = useCallback((): ViewMode => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "grid" || saved === "list") return saved;
    } catch {
      // Mode privat / storage penuh: pakai default viewport.
    }
    return window.matchMedia("(max-width: 767px)").matches ? mobileDefault : "list";
  }, [storageKey, mobileDefault]);

  const storedMode = useSyncExternalStore(subscribeMode, readMode, () => null);
  const mode = override ?? storedMode;

  const pick = (next: ViewMode) => {
    setOverride(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Preferensi tidak persisten, tampilan tetap berubah untuk sesi ini.
    }
  };

  const listInitial = mobileDefault === "list" ? "block" : "hidden md:block";
  const gridInitial = mobileDefault === "grid" ? "block md:hidden" : "hidden";
  const listVisible = mode === null ? listInitial : mode === "list" ? "block" : "hidden";
  const gridVisible = mode === null ? gridInitial : mode === "grid" ? "block" : "hidden";

  return (
    <RecordCollectionContext.Provider value={{ mode, setMode: pick }}>
      <section aria-label={label} className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-end gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Tampilan
          </span>
          <div
            role="group"
            aria-label="Pilih tampilan data"
            className="flex border-2 border-ink"
          >
            <IconButton
              label="Tampilan daftar"
              icon={List}
              variant="ghost"
              aria-pressed={mode === "list"}
              onClick={() => pick("list")}
              className={cn(
                "border-0! shadow-none",
                mode === "list" ? "bg-accent text-ink" : "bg-surface hover:bg-muted"
              )}
            />
            <span aria-hidden="true" className="w-0.5 shrink-0 bg-ink" />
            <IconButton
              label="Tampilan kotak"
              icon={LayoutGrid}
              variant="ghost"
              aria-pressed={mode === "grid"}
              onClick={() => pick("grid")}
              className={cn(
                "border-0! shadow-none",
                mode === "grid" ? "bg-accent text-ink" : "bg-surface hover:bg-muted"
              )}
            />
          </div>
        </div>

        <div className={cn("min-w-0", listVisible)}>{list}</div>
        <div className={cn("min-w-0", gridVisible)}>{grid}</div>
      </section>
    </RecordCollectionContext.Provider>
  );
}

/**
 * Tombol edit untuk tampilan grid: pindah ke tampilan daftar lalu buka form
 * inline yang sudah ada. Ini mencegah form yang sama dirender dua kali
 * (duplicate id input) saat kedua tampilan tetap ter-mount.
 */
export function RecordEditButton({
  label,
  onEdit,
  target = "list",
  icon = Pencil,
}: {
  label: string;
  onEdit: () => void;
  target?: ViewMode;
  icon?: LucideIcon;
}) {
  const { setMode } = useRecordCollection();

  return (
    <IconButton
      label={label}
      icon={icon}
      compact
      onClick={() => {
        setMode(target);
        onEdit();
      }}
    />
  );
}