"use client";

import dynamic from "next/dynamic";

import { ChartSkeleton } from "@/components/ui/chart-skeleton";

/**
 * BreakdownChart — wrapper dynamic import.
 * Recharts tidak dimuat sampai komponen ini dirender.
 */
export const BreakdownChart = dynamic(
  () => import("./BreakdownChartInner").then((mod) => mod.BreakdownChartInner),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);
