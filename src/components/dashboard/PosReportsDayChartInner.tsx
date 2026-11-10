"use client";

/**
 * PosReportsDayChartInner — chart Recharts per hari untuk PosReportsPanel.
 * Diimpor dinamis supaya bundle POS panel tetap ringan sampai tab HARI dibuka.
 */

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CHART_STYLE } from "@/components/ui/chart-style";
import { formatIDR } from "@/lib/dashboard-math";

const chartConfig = {
  revenue: { label: "Pendapatan", color: "var(--chart-1)" },
} satisfies ChartConfig;

function compactIDR(v: number): string {
  if (v >= 1_000_000) return `${Math.round(v / 100_000) / 10}jt`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}rb`;
  return String(v);
}

export function PosReportsDayChartInner({ data }: { data: { date: string; amount: number }[] }) {
  const chart = CHART_STYLE;

  return (
    <ChartContainer config={chartConfig} className="mt-2 aspect-auto h-[180px] w-full">
      <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid
          vertical={false}
          stroke={chart.gridStroke}
          strokeOpacity={chart.gridOpacity}
        />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={chart.axisLine}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(v: string) => v.slice(5)}
          tick={{ fontSize: 11, fontFamily: chart.tickFontFamily }}
        />
        <YAxis
          width={52}
          tickLine={false}
          axisLine={false}
          tickFormatter={compactIDR}
          tick={{ fontSize: 11, fontFamily: chart.tickFontFamily }}
        />
        <ChartTooltip
          cursor={{ fill: chart.cursorFill, fillOpacity: chart.cursorOpacity }}
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value) => (
                <span className="font-mono font-bold">{formatIDR(Number(value))}</span>
              )}
            />
          }
        />
        <Bar
          dataKey="amount"
          fill="var(--color-revenue)"
          stroke={chart.barStroke}
          strokeWidth={chart.barStrokeWidth}
          radius={chart.barRadius}
          maxBarSize={28}
        />
      </BarChart>
    </ChartContainer>
  );
}
