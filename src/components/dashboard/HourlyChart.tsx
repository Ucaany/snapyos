/**
 * HourlyChart — histogram 24 slot jam lokal (CSS grid, tanpa lib chart).
 * Server-safe (tanpa hook). Dipakai metrics & analytics untuk jam ramai
 * transaksi PAID. Bar puncak = accent, non-nol = ink/70, nol = ink/10.
 */

function hourLabel(h: number): string {
  return String(h).padStart(2, "0");
}

export function HourlyChart({
  hourly,
  peakHour,
  peakCount,
}: {
  hourly: number[];
  peakHour: number | null;
  peakCount: number;
}) {
  const slots =
    hourly.length === 24 ? hourly : Array.from({ length: 24 }, (_, h) => hourly[h] ?? 0);
  const total = slots.reduce((sum, n) => sum + n, 0);
  const maxHourly = Math.max(1, ...slots);

  return (
    <div className="border-2 border-ink bg-bg p-2">
      {total === 0 ? (
        <p className="py-10 text-center font-mono text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          BELUM ADA TRANSAKSI PAID PADA JAM INI
        </p>
      ) : (
        <>
          <div
            className="grid h-28 grid-cols-12 items-end gap-[2px] md:grid-cols-[repeat(24,minmax(0,1fr))]"
            role="img"
            aria-label={`Histogram transaksi paid per jam lokal, puncak ${
              peakHour !== null ? hourLabel(peakHour) + ":00" : "-"
            } dengan ${peakCount} transaksi`}
          >
            {slots.map((count, h) => (
              <div
                key={h}
                className={
                  h === peakHour ? "bg-accent" : count > 0 ? "bg-ink/70" : "bg-ink/10"
                }
                style={{ height: `${Math.max(2, Math.round((count / maxHourly) * 100))}%` }}
                title={`${hourLabel(h)}:00: ${count} trx`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        </>
      )}
    </div>
  );
}
