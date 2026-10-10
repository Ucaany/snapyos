"use client";

import dynamic from "next/dynamic";

import { ChartSkeleton } from "@/components/ui/chart-skeleton";

export const AdminTrendChart = dynamic(
  () => import("./AdminTrendChartInner").then((mod) => mod.AdminTrendChartInner),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);
