"use client";

import dynamic from "next/dynamic";

import { ChartSkeleton } from "@/components/ui/chart-skeleton";

/**
 * RevenueChart — wrapper dynamic import.
 * Recharts (heavy) tidak dimuat sampai komponen ini benar-benar dirender.
 * ssr: false karena chart butuh window untuk ResponsiveContainer.
 */
const RevenueChartDynamic = dynamic(
  () => import("./RevenueChartInner").then((mod) => mod.RevenueChartInner),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);

export function RevenueChart({
  data,
  timeZone,
}: {
  data: { date: string; amount: number }[];
  timeZone?: string;
}) {
  return <RevenueChartDynamic data={data} timeZone={timeZone} />;
}
