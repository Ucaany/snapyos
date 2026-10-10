export default function OnboardingLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-bg p-6">
      <div className="h-4 w-40 animate-pulse bg-ink/10" />
      <div className="h-10 w-72 animate-pulse bg-ink/10" />
      <div className="mt-4 flex w-full max-w-lg flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="h-3 w-24 animate-pulse bg-ink/10" />
            <div className="h-11 animate-pulse border-2 border-ink/10 bg-ink/5" />
          </div>
        ))}
        <div className="mt-2 h-12 animate-pulse border-2 border-ink/10 bg-ink/5" />
      </div>
    </div>
  );
}
