"use client";

/**
 * RevenueChartInner — implementasi Recharts. Diimpor dinamis via
 * `RevenueChart.tsx` supaya Recharts tidak masuk bundle first-load.
 */

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

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
  const chart = CHART_STYLE;

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
      <LineChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          tickFormatter={tickDate}
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
        <Line
          dataKey="amount"
          type="monotone"
          stroke="var(--color-revenue)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
