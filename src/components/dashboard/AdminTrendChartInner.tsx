"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CHART_STYLE } from "@/components/ui/chart-style";

const chartConfig = {
  txCount: { label: "Transaksi", color: "var(--chart-1)" },
  sessionCount: { label: "Sesi", color: "var(--chart-2)" },
} satisfies ChartConfig;

function tickDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function AdminTrendChartInner({
  data,
}: {
  data: { date: string; txCount: number; sessionCount: number }[];
}) {
  const chart = CHART_STYLE;

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
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
          width={40}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          tick={{ fontSize: 11, fontFamily: chart.tickFontFamily }}
        />
        <ChartTooltip
          cursor={{ stroke: "#111111", strokeOpacity: 0.2 }}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <Line
          dataKey="txCount"
          type="monotone"
          stroke="var(--color-txCount)"
          strokeWidth={chart.barStrokeWidth}
          dot={false}
          activeDot={{ r: 3 }}
        />
        <Line
          dataKey="sessionCount"
          type="monotone"
          stroke="var(--color-sessionCount)"
          strokeWidth={chart.barStrokeWidth}
          dot={false}
          activeDot={{ r: 3 }}
        />
      </LineChart>
    </ChartContainer>
  );
}
