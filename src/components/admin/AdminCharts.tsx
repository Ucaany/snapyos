"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/admin/ui/chart";
import { formatIDR } from "@/lib/dashboard-math";

const revenueConfig = {
  revenue: { label: "Pendapatan", color: "var(--chart-1)" },
} satisfies ChartConfig;

const breakdownConfig = {
  amount: { label: "Pendapatan", color: "var(--chart-1)" },
} satisfies ChartConfig;

const trendConfig = {
  txCount: { label: "Transaksi", color: "var(--chart-1)" },
  sessionCount: { label: "Sesi", color: "var(--chart-2)" },
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

export function AdminRevenueChart({
  data,
}: {
  data: { date: string; amount: number }[];
  timeZone?: string;
}) {
  const series = data.map((point) => ({ ...point, revenue: point.amount }));

  return (
    <ChartContainer
      config={revenueConfig}
      className="aspect-auto h-[260px] w-full"
      role="img"
      aria-label="Grafik garis pendapatan harian 30 hari terakhir"
    >
      <LineChart accessibilityLayer data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={tickDate}
        />
        <YAxis width={52} tickLine={false} axisLine={false} tickFormatter={compactIDR} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Line
          dataKey="revenue"
          type="monotone"
          stroke="var(--color-revenue)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

export function AdminBreakdownChart({ data }: { data: { label: string; amount: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        Belum ada data breakdown.
      </div>
    );
  }

  return (
    <ChartContainer
      config={breakdownConfig}
      className="aspect-auto h-[260px] w-full"
      role="img"
      aria-label="Grafik batang volume pembayaran per provider"
    >
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={compactIDR} />
        <YAxis type="category" dataKey="label" width={120} tickLine={false} axisLine={false} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={
            <ChartTooltipContent indicator="dot" formatter={(value) => formatIDR(Number(value))} />
          }
        />
        <Bar dataKey="amount" fill="var(--color-amount)" radius={4} maxBarSize={24} />
      </BarChart>
    </ChartContainer>
  );
}

export function AdminTrendChart({
  data,
}: {
  data: { date: string; txCount: number; sessionCount: number }[];
}) {
  return (
    <ChartContainer
      config={trendConfig}
      className="aspect-auto h-[260px] w-full"
      role="img"
      aria-label="Grafik garis jumlah transaksi dan sesi foto 30 hari terakhir"
    >
      <LineChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={tickDate}
        />
        <YAxis width={40} tickLine={false} axisLine={false} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Line
          dataKey="txCount"
          type="monotone"
          stroke="var(--color-txCount)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="sessionCount"
          type="monotone"
          stroke="var(--color-sessionCount)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

const numberFormatter = new Intl.NumberFormat("id-ID");

/** Donut ringkas + legend nilai eksplisit (warna tidak bergantung legend recharts). */
export function AdminDonutChart({
  data,
  height = 190,
  valueFormatter = (value: number) => numberFormatter.format(value),
  center,
  showLegend = true,
}: {
  data: { key: string; label: string; value: number; color: string }[];
  height?: number;
  valueFormatter?: (value: number) => string;
  center?: { label: string; value: string };
  /** false bila pemanggil sudah punya daftar status sendiri (hindari duplikat). */
  showLegend?: boolean;
}) {
  const config = Object.fromEntries(
    data.map((item) => [item.key, { label: item.label, color: item.color }])
  ) satisfies ChartConfig;
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="flex flex-col gap-4">
      <ChartContainer
        config={config}
        className="mx-auto aspect-auto w-full"
        style={{ height }}
        role="img"
        aria-label={`Komposisi ${data.map((item) => item.label).join(", ")}`}
      >
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={
              <ChartTooltipContent
                nameKey="key"
                hideLabel
                formatter={(value) => valueFormatter(Number(value))}
              />
            }
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="key"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            strokeWidth={2}
          >
            {data.map((item) => (
              <Cell key={item.key} fill={`var(--color-${item.key})`} />
            ))}
            {center ? (
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                  const { cx, cy } = viewBox as { cx: number; cy: number };
                  return (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan
                        x={cx}
                        y={cy - 6}
                        className="fill-foreground text-lg font-semibold tabular-nums"
                      >
                        {center.value}
                      </tspan>
                      <tspan x={cx} y={cy + 14} className="fill-muted-foreground text-xs">
                        {center.label}
                      </tspan>
                    </text>
                  );
                }}
              />
            ) : null}
          </Pie>
        </PieChart>
      </ChartContainer>

      {showLegend ? (
        <ul className={showLegend ? "grid grid-cols-2 gap-x-4 gap-y-2" : "hidden"}>
          {data.map((item) => (
            <li key={item.key} className="flex min-w-0 items-center gap-2 text-xs">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span className="truncate text-muted-foreground">{item.label}</span>
              <span className="ml-auto font-medium tabular-nums">
                {valueFormatter(item.value)}
              </span>
              <span className="w-9 shrink-0 text-right text-muted-foreground tabular-nums">
                {total ? Math.round((item.value / total) * 100) : 0}%
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
