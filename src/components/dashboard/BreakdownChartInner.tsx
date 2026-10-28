"use client";

/**
 * BreakdownChart — bar chart breakdown revenue (docs/04 §4.2, docs/11 §11.4:
 * chart wajib shadcn/ui Charts = Recharts wrapper).
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
  amount: { label: "Pendapatan", color: "var(--chart-1)" },
} satisfies ChartConfig;

function compactIDR(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}jt`;
  if (n >= 1_000) return `${Math.round(n / 1000)}rb`;
  return String(n);
}

export function BreakdownChartInner({ data }: { data: { label: string; amount: number }[] }) {
  const chart = CHART_STYLE;

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[320px] w-full">
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} stroke={chart.gridStroke} strokeOpacity={chart.gridOpacity} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={chart.axisLine}
          tickFormatter={compactIDR}
          tick={{ fontSize: 11, fontFamily: chart.tickFontFamily }}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={120}
          tickLine={false}
          axisLine={false}
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
          fill="var(--color-amount)"
          stroke={chart.barStroke}
          strokeWidth={chart.barStrokeWidth}
          radius={chart.barRadius}
          maxBarSize={24}
        />
      </BarChart>
    </ChartContainer>
  );
}
