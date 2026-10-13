/** Skeleton package staff, cocokkan layout final (docs/13 §13.6). */
export default function StaffPackagesLoading() {
  return (
    <div
      className="flex flex-col gap-8 p-6 md:p-10"
      aria-busy="true"
      aria-label="Memuat package"
    >
      <div className="h-4 w-44 animate-pulse bg-muted" />
      <div className="h-10 w-64 animate-pulse bg-muted" />
      <div className="h-4 w-full max-w-[65ch] animate-pulse bg-muted" />
      <div className="h-4 w-40 animate-pulse bg-muted" />
      <div className="border-2 border-ink shadow-[4px_4px_0_0_#111111]">
        <div className="h-10 w-full animate-pulse bg-ink/80" />
        <div className="flex flex-col divide-y-2 divide-ink/10">
          <div className="h-12 w-full animate-pulse bg-muted" />
          <div className="h-12 w-full animate-pulse bg-muted" />
          <div className="h-12 w-full animate-pulse bg-muted" />
        </div>
      </div>
    </div>
  );
}
