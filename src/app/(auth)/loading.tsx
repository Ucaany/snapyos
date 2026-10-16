export default function AuthLoading() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-bg px-6 md:px-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 p-6 md:p-8">
        <div className="size-12 animate-pulse rounded-none bg-ink/10" />
        <div className="flex w-full flex-col items-center gap-3">
          <div className="h-7 w-52 animate-pulse bg-ink/10" />
          <div className="h-4 w-64 animate-pulse bg-ink/10" />
        </div>
        <div className="mt-2 flex w-full flex-col gap-4">
          <div className="h-11 animate-pulse border-2 border-ink/10 bg-ink/5" />
          <div className="h-11 animate-pulse border-2 border-ink/10 bg-ink/5" />
          <div className="h-9 w-48 animate-pulse bg-ink/10" />
          <div className="h-10 animate-pulse border-2 border-ink/10 bg-ink/5" />
        </div>
      </div>
    </div>
  );
}
