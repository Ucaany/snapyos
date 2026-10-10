"use client";

/**
 * RevenueChartInner — implementasi Recharts. Diimpor dinamis via
 * `RevenueChart.tsx` supaya Recharts tidak masuk bundle first-load.
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
  revenue: { label: "Pendapatan", color: "var(--chart-1)" },
} satisfies ChartConfig;

function compactIDR(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}jt`;
  if (n >= 1_000) return `${Math.round(n / 1000)}rb`;
  return String(n);
}

function tickDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function RevenueChartInner({
  data,
  timeZone,
}: {
  data: { date: string; amount: number }[];
  timeZone?: string;
}) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
      <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#111111" strokeOpacity={0.15} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={{ stroke: "#111111", strokeWidth: 2 }}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={tickDate}
          tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }}
        />
        <YAxis
          width={52}
          tickLine={false}
          axisLine={false}
          tickFormatter={compactIDR}
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
              labelFormatter={(_, payload) => {
                const iso = payload?.[0]?.payload?.date as string | undefined;
                return iso ? (
                  <span className="font-mono uppercase">
                    {new Date(iso + "T00:00:00Z").toLocaleDateString("id-ID", {
                      timeZone: timeZone || "Asia/Jakarta",
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                ) : null;
              }}
            />
          }
        />
        <Bar
          dataKey="amount"
          fill="var(--color-revenue)"
          stroke="#111111"
          strokeWidth={2}
          radius={0}
          maxBarSize={28}
        />
      </BarChart>
    </ChartContainer>
  );
}
