"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { DashboardTheme } from "@/lib/dashboard-theme";

/**
 * Tema shell dashboard untuk komponen primitif (Card/Table/Badge/Button/Chart).
 *
 * Default "brutalist": semua pemakaian di luar shell dashboard (marketing,
 * auth, kiosk, POS) otomatis tetap memakai primitif Neo-Brutalism, tanpa perlu
 * diubah satu per satu.
 */
const DashboardThemeContext = createContext<DashboardTheme>("brutalist");

export function DashboardThemeProvider({
  theme,
  children,
}: {
  theme: DashboardTheme;
  children: ReactNode;
}) {
  return (
    <DashboardThemeContext.Provider value={theme}>{children}</DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme(): DashboardTheme {
  return useContext(DashboardThemeContext);
}

/** Ringkas: true saat shell tema modern aktif. */
export function useIsModernTheme(): boolean {
  return useContext(DashboardThemeContext) === "modern";
}
