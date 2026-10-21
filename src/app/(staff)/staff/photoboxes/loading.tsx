/** Skeleton booth staff, mengikuti kartu record final (docs/13 §13.6). */
export default function StaffPhotoboxesLoading() {
  return (
    <div
      className="flex flex-col gap-6 p-4 pb-10 sm:gap-8 sm:p-6 md:p-8 lg:p-10"
      aria-busy="true"
      aria-label="Memuat booth"
    >
      <div className="grid gap-5 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111] sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="space-y-3">
          <div className="h-6 w-36 animate-pulse border-2 border-ink/20 bg-muted" />
          <div className="h-10 w-56 max-w-full animate-pulse bg-muted" />
          <div className="h-4 w-full max-w-[52ch] animate-pulse bg-muted" />
        </div>
        <div className="h-14 w-full animate-pulse border-2 border-ink/20 bg-muted md:w-32" />
      </div>
      <div className="border-2 border-ink/20 shadow-[4px_4px_0_0_#111111]/10">
        <div className="h-10 animate-pulse bg-ink/80" />
        <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-56 animate-pulse border-2 border-ink/20 bg-muted"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
