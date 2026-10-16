/** Skeleton halaman hasil online — cocokkan layout final (docs/13 §13.4). */
export default function ResultLoading() {
  return (
    <div
      className="min-h-[100dvh] bg-bg"
      aria-busy="true"
      aria-label="Memuat hasil foto"
    >
      <div className="border-b-2 border-ink bg-surface">
        <div className="mx-auto flex max-w-[900px] items-center justify-between px-6 py-4">
          <div className="h-3 w-40 animate-pulse bg-muted" />
          <div className="h-3 w-20 animate-pulse bg-muted" />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-8 px-6 py-10">
        <div className="h-14 w-72 animate-pulse bg-muted" />
        <div className="flex flex-col gap-3">
          <div className="h-3 w-28 animate-pulse bg-muted" />
          <div className="h-[300px] w-full animate-pulse border-2 border-ink/20 bg-muted" />
          <div className="h-12 w-36 animate-pulse bg-muted" />
        </div>
        <div className="flex flex-col gap-4">
          <div className="h-3 w-32 animate-pulse bg-muted" />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-64 animate-pulse border-2 border-ink/20 bg-muted"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
