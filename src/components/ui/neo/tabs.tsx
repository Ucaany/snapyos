"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ComponentProps,
  type KeyboardEvent,
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
  defaultValue?: string;
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
  const [internal, setInternal] = useState(defaultValue ?? "");
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
        "grid min-w-0 grid-cols-2 border-2 border-ink bg-surface sm:grid-cols-4",
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
  onClick: onClickProp,
  onKeyDown: onKeyDownProp,
  ...props
}: ComponentProps<"button"> & { value: string }) {
  const tabs = useTabs();
  const active = tabs.value === value;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDownProp?.(event);
    if (event.defaultPrevented) return;
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    const list = event.currentTarget.closest('[role="tablist"]');
    const items = Array.from(
      list?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []
    );
    if (items.length === 0) return;
    const index = items.indexOf(event.currentTarget);
    let next = index;
    if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    event.preventDefault();
    items[next]?.focus();
    items[next]?.click();
  };

  return (
    <button
      type="button"
      role="tab"
      id={`${tabs.baseId}-tab-${value}`}
      aria-selected={active}
      aria-controls={`${tabs.baseId}-panel-${value}`}
      tabIndex={active ? 0 : -1}
      data-slot="tabs-trigger"
      data-state={active ? "active" : "inactive"}
      onClick={(event) => {
        onClickProp?.(event);
        if (!event.defaultPrevented) tabs.setValue(value);
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        "min-h-11 min-w-0 border-r-2 border-b-2 border-ink px-3 font-mono text-[11px] font-bold uppercase leading-none tracking-[0.08em] transition-colors outline-none [&:nth-child(2n)]:border-r-0 [&:nth-child(3)]:border-b-0 [&:nth-child(4)]:border-b-0 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ink sm:border-b-0 sm:[&:nth-child(2n)]:border-r-2 sm:[&:nth-child(4n)]:border-r-0",
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
