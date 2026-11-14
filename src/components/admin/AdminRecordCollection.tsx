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

import { Button } from "@/components/admin/ui/button";
import { Card, CardContent } from "@/components/admin/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/admin/ui/toggle-group";
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
 * Pemilih tampilan daftar/grid admin. Perilaku sama dengan RecordCollection
 * lama (localStorage + media query), visual memakai shadcn Button.
 */
export function AdminRecordCollection({
  storageKey,
  list,
  grid,
  label = "Daftar data",
  title,
  description,
  mobileDefault = "grid",
}: {
  storageKey: string;
  list: ReactNode;
  grid: ReactNode;
  label?: string;
  title?: string;
  description?: string;
  mobileDefault?: ViewMode;
}) {
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
      <section aria-label={label} className="flex flex-col gap-3">
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-medium">{title ?? label}</h2>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">Tampilan</span>
            <ToggleGroup
              value={mode ? [mode] : []}
              onValueChange={(value) => {
                const next = value[0];
                if (next === "list" || next === "grid") pick(next);
              }}
              variant="outline"
              size="sm"
              aria-label="Pilih tampilan data"
            >
              <ToggleGroupItem value="list" aria-label="Tampilan daftar">
                <List className="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" aria-label="Tampilan kotak">
                <LayoutGrid className="size-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className={cn("min-w-0", listVisible)}>
          <Card>
            <CardContent>{list}</CardContent>
          </Card>
        </div>
        <div className={cn("min-w-0", gridVisible)}>{grid}</div>
      </section>
    </RecordCollectionContext.Provider>
  );
}

export function AdminRecordEditButton({
  label,
  onEdit,
  target = "list",
  icon: Icon = Pencil,
}: {
  label: string;
  onEdit: () => void;
  target?: ViewMode;
  icon?: LucideIcon;
}) {
  const { setMode } = useRecordCollection();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={() => {
        setMode(target);
        onEdit();
      }}
    >
      <Icon className="size-4" />
    </Button>
  );
}
