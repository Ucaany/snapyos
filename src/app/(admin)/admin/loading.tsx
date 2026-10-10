export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse bg-ink/10" />
        <div className="h-10 w-64 animate-pulse bg-ink/10" />
      </div>
      <div className="grid grid-cols-1 gap-[2px] border-2 border-ink bg-ink md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 bg-surface p-4">
            <div className="h-3 w-20 animate-pulse bg-ink/10" />
            <div className="h-8 w-16 animate-pulse bg-ink/10" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse border-2 border-ink/10 bg-ink/5"
          />
        ))}
      </div>
    </div>
  );
}
