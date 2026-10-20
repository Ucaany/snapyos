export default function PosLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col gap-6 bg-bg p-6">
      <div className="flex items-center justify-between border-b-2 border-ink pb-4">
        <div className="h-6 w-40 animate-pulse bg-ink/10" />
        <div className="h-6 w-24 animate-pulse bg-ink/10" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="col-span-2 flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse border-2 border-ink/10 bg-ink/5" />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <div className="h-40 animate-pulse border-2 border-ink/10 bg-ink/5" />
          <div className="h-12 animate-pulse border-2 border-ink/10 bg-ink/5" />
        </div>
      </div>
    </div>
  );
}
