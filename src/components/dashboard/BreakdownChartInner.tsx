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
import { formatIDR } from "@/lib/dashboard-math";

const chartConfig = {
  amount: { label: "Pendapatan", color: "var(--chart-1)" },
} satisfies ChartConfig;

function compactIDR(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}jt`;
  if (n >= 1_000) return `${Math.round(n / 1000)}rb`;
  return String(n);
}

export function BreakdownChartInner({
  data,
}: {
  data: { label: string; amount: number }[];
}) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[320px] w-full">
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} stroke="#111111" strokeOpacity={0.15} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={{ stroke: "#111111", strokeWidth: 2 }}
          tickFormatter={compactIDR}
          tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={120}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
        />
        <ChartTooltip
          cursor={{ fill: "#111111", fillOpacity: 0.06 }}
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value) => (
                <span className="font-mono font-bold">
                  {formatIDR(Number(value))}
                </span>
              )}
            />
          }
        />
        <Bar
          dataKey="amount"
          fill="var(--color-amount)"
          stroke="#111111"
          strokeWidth={2}
          radius={0}
          maxBarSize={24}
        />
      </BarChart>
    </ChartContainer>
  );
}
