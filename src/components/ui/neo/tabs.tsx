"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

/**
 * Tabs neobrutalist — adaptasi neobrutalism.dev ke token SnapyOS.
 * Tanpa dependency baru; hanya primitif HTML + state React.
 */

type TabsContextValue = {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs components must be used inside <Tabs>");
  return ctx;
}

type TabsProps = {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: ReactNode;
};

export function Tabs({
  defaultValue,
  value: controlled,
  onValueChange,
  className,
  children,
}: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const baseId = useId();
  const value = controlled ?? internal;
  const setValue = (next: string) => {
    if (controlled === undefined) setInternal(next);
    onValueChange?.(next);
  };

  return (
    <TabsContext.Provider value={{ value, setValue, baseId }}>
      <div data-slot="tabs" className={cn("flex min-w-0 flex-col gap-4", className)}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="tabs-list"
      role="tablist"
      className={cn(
        "flex min-w-0 flex-wrap items-stretch gap-0 border-2 border-ink bg-surface",
        className
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { value: string }) {
  const tabs = useTabs();
  const active = tabs.value === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${tabs.baseId}-tab-${value}`}
      aria-selected={active}
      aria-controls={`${tabs.baseId}-panel-${value}`}
      data-slot="tabs-trigger"
      data-state={active ? "active" : "inactive"}
      onClick={() => tabs.setValue(value)}
      className={cn(
        "min-h-11 flex-1 border-r-2 border-ink px-3 font-mono text-[11px] font-bold uppercase leading-none tracking-[0.08em] transition-colors outline-none last:border-r-0 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ink",
        active ? "bg-accent text-ink" : "bg-surface text-muted-foreground hover:bg-muted",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { value: string }) {
  const tabs = useTabs();
  const active = tabs.value === value;
  return (
    <div
      role="tabpanel"
      id={`${tabs.baseId}-panel-${value}`}
      aria-labelledby={`${tabs.baseId}-tab-${value}`}
      data-slot="tabs-content"
      hidden={!active}
      className={cn("min-w-0", active && "block", className)}
      {...props}
    >
      {children}
    </div>
  );
}
