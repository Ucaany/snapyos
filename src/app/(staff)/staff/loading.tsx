/** Skeleton overview staff, cocokkan layout final (docs/13 §13.6). */
export default function StaffOverviewLoading() {
  return (
    <div
      className="flex flex-col gap-8 p-6 md:p-10"
      aria-busy="true"
      aria-label="Memuat overview staff"
    >
      <div className="h-4 w-52 animate-pulse bg-muted" />
      <div className="h-10 w-72 animate-pulse bg-muted" />
      <div className="h-3 w-64 animate-pulse bg-muted" />
      <div className="grid grid-cols-2 gap-[2px] border-2 border-ink/20 bg-muted sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse bg-muted" />
        ))}
      </div>
      <div className="h-3 w-40 animate-pulse bg-muted" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="h-36 animate-pulse border-2 border-ink/20 bg-muted" />
        <div className="h-36 animate-pulse border-2 border-ink/20 bg-muted" />
      </div>
    </div>
  );
}
