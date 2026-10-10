/** Skeleton template staff, cocokkan layout final (docs/13 §13.6). */
export default function StaffTemplatesLoading() {
  return (
    <div
      className="flex flex-col gap-8 p-6 md:p-10"
      aria-busy="true"
      aria-label="Memuat template"
    >
      <div className="h-4 w-44 animate-pulse bg-muted" />
      <div className="h-10 w-64 animate-pulse bg-muted" />
      <div className="h-4 w-full max-w-[65ch] animate-pulse bg-muted" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <div className="h-72 animate-pulse border-2 border-ink/20 bg-muted" />
        <div className="h-72 animate-pulse border-2 border-ink/20 bg-muted" />
        <div className="h-72 animate-pulse border-2 border-ink/20 bg-muted" />
      </div>
    </div>
  );
}
