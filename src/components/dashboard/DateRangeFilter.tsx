"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { shiftISO, todayISO } from "@/lib/dashboard-math";

const PRESETS: { label: string; days: number }[] = [
  { label: "7 HARI", days: 7 },
  { label: "30 HARI", days: 30 },
  { label: "90 HARI", days: 90 },
];

const dateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function parseISODate(iso: string): Date | undefined {
  return iso ? new Date(iso + "T00:00:00") : undefined;
}

function toISODate(date: Date | undefined): string | undefined {
  if (!date) return undefined;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * DateRangeFilter — filter tanggal dashboard via searchParams (?from=&to=).
 *
 * Popover kalender: SELALU 1 bulan (306px — muat viewport terkecil, presisi,
 * tanpa tumpang tindih). Dibuka → tampil bulan berjalan; navigasi mundur
 * sampai 11 bulan; maju maksimal ke bulan berjalan (tanggal > hari ini
 * dinonaktifkan). Rentang lengkap → popover tutup otomatis.
 */
export function DateRangeFilter({
  from,
  to,
  timeZone = "Asia/Jakarta",
  basePath = "/dashboard",
}: {
  from: string;
  to: string;
  /** Timezone bisnis — sinkron dengan default server (resolveRange). */
  timeZone?: string;
  /** Route tujuan filter (default dashboard; analytics/finance dst.). */
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => new Date());
  // Fase pilihan: null = belum ada "mulai"; Date = menunggu klik "akhir".
  const [pickStart, setPickStart] = useState<Date | null>(null);
  // Highlight rentang saat memilih — lokal, URL hanya ditulis saat final.
  const [sel, setSel] = useState<DateRange>({ from: undefined, to: undefined });

  const today = todayISO(timeZone);
  const todayDate = parseISODate(today) ?? new Date();

  // Fallback bila from/to kosong/tidak valid (mis. halaman dibuka tanpa
  // ?from=&to=): tampilkan default 30 hari agar label tidak "Invalid Date".
  const fromNorm = parseISODate(from) ? from : shiftISO(today, -29);
  const toNorm = parseISODate(to) ? to : today;

  // Batas navigasi bulan: 11 bulan ke belakang … bulan berjalan.
  const startMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() - 11, 1);
  const endMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0);

  const days =
    Math.round(
      (Date.parse(toNorm + "T00:00:00Z") - Date.parse(fromNorm + "T00:00:00Z")) / 86_400_000
    ) + 1;

  function apply(next: { from: string; to: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", next.from);
    params.set("to", next.to);
    // Rentang baru = dataset baru — paginasi kembali ke halaman 1.
    params.delete("page");
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  }

  function applyPreset(days: number) {
    apply({ from: shiftISO(today, -(days - 1)), to: today });
  }

  const range: DateRange = {
    from: parseISODate(fromNorm),
    to: parseISODate(toNorm),
  };

  function handleDayClick(day: Date, mods: { disabled?: boolean }) {
    if (mods.disabled) return;
    if (!pickStart) {
      // Klik pertama: kunci tanggal mulai — highlight lokal, popover tetap terbuka.
      setPickStart(day);
      setSel({ from: day, to: day });
      return;
    }
    // Klik kedua: urutkan, tulis URL SEKALI (navigasi tunggal), tutup popover.
    const [start, end] = pickStart <= day ? [pickStart, day] : [day, pickStart];
    setPickStart(null);
    setSel({ from: start, to: end });
    apply({ from: toISODate(start) ?? fromNorm, to: toISODate(end) ?? toNorm });
    setOpen(false);
  }

  const label = `${dateFmt.format(range.from!)} → ${dateFmt.format(range.to!)}`;

  return (
    <div className="flex w-full flex-col gap-2 border-2 border-ink bg-surface p-2 shadow-hard sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex shrink-0 items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          <CalendarRange aria-hidden className="size-4" />
          Periode
        </span>
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            // Dibuka → bulan berjalan, fase pilihan & highlight disinkronkan
            // dengan rentang URL saat ini.
            if (next) {
              setMonth(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
              setPickStart(null);
              setSel({ from: parseISODate(fromNorm), to: parseISODate(toNorm) });
            }
          }}
        >
          <PopoverTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="neutral"
                aria-label="Pilih rentang tanggal"
                className="min-h-11 min-w-0 shrink justify-between px-3 sm:min-h-9 sm:flex-none sm:shrink-0 sm:justify-center"
              />
            }
          >
            <CalendarRange aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs uppercase tracking-[0.05em] sm:flex-none">
              {label}
            </span>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" className="w-auto p-0">
            <Calendar
              mode="range"
              numberOfMonths={1}
              month={month}
              onMonthChange={setMonth}
              selected={sel.from ? sel : range}
              onDayClick={handleDayClick}
              startMonth={startMonth}
              endMonth={endMonth}
              disabled={{ after: todayDate }}
              required
              className="p-2"
              aria-label="Rentang tanggal"
            />
          </PopoverContent>
        </Popover>
      </div>
      <div
        className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap"
        role="group"
        aria-label="Preset periode"
      >
        {PRESETS.map((p) => (
          <Button
            key={p.days}
            type="button"
            size="sm"
            variant={days === p.days ? "default" : "neutral"}
            className="min-h-11 sm:min-h-9"
            onClick={() => applyPreset(p.days)}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
