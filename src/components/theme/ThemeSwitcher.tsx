"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cn } from "@/lib/utils";
import { setThemeCookie, type DashboardTheme } from "@/lib/dashboard-theme";

/**
 * Pemilih tema shell dashboard. Cookie per-browser (pola sama dengan
 * CollapsibleShell), lalu router.refresh() agar layout server membaca ulang.
 * Tidak ada migrasi DB: preferensi tampilan bukan data bisnis.
 */
const OPTIONS: { value: DashboardTheme; label: string; hint: string }[] = [
  { value: "brutalist", label: "Brutalis", hint: "Tampilan bawaan SnapyOS" },
  { value: "modern", label: "Modern", hint: "Sidebar ringkas, sudut lembut" },
];

export function ThemeSwitcher({ current }: { current: DashboardTheme }) {
  const router = useRouter();
  const [selected, setSelected] = useState<DashboardTheme>(current);
  const [pending, startTransition] = useTransition();

  function choose(next: DashboardTheme) {
    if (next === selected) return;
    setSelected(next);
    setThemeCookie(next);
    startTransition(() => router.refresh());
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tema dashboard">
      {OPTIONS.map((option) => {
        const active = selected === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={pending}
            onClick={() => choose(option.value)}
            className={cn(
              "flex flex-col items-start gap-1 border-2 border-ink px-4 py-3 text-left transition-colors",
              active ? "bg-accent text-ink" : "bg-surface text-ink hover:bg-muted"
            )}
          >
            <span className="font-mono text-xs font-bold uppercase tracking-[0.08em]">
              {option.label}
            </span>
            <span className="text-xs text-muted-foreground">{option.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
