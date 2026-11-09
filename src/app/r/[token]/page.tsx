import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api-errors";
import { getResult } from "@/server/kiosk-sessions";
import { ResultShareActions } from "@/components/result/ResultShareActions";

export const metadata: Metadata = {
  title: "Hasil Foto · SnapyOS",
};

type Props = { params: Promise<{ token: string }> };

function formatExpiry(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/** GET /r/[token] — online result (docs/05 §5.13: GIF + foto berframe). */
export default async function ResultPage({ params }: Props) {
  const { token } = await params;

  // Hanya NOT_FOUND (token salah / link kedaluwarsa) yang jadi 404. Gangguan
  // sesaat (DB/storage down) dilempar ke error boundary — idiom yang sama
  // dengan /p/[businessSlug]: link yang sebenarnya valid tidak boleh salah
  // dilaporkan sebagai "kedaluwarsa" (docs/05 §5.13, retention docs/09 §9.8).
  let result: Awaited<ReturnType<typeof getResult>>;
  try {
    result = await getResult(token);
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === "NOT_FOUND") notFound();
    throw cause;
  }

  // Signed URL sudah final (TTL 1 jam, tak perlu optimasi/resize server) —
  // `<img>` langsung, idiom yang sama dengan ResultScreen kiosk.
  const photos = result.photos.filter((p) => p.url);
  const expiry = formatExpiry(result.expires_at);

  const cardShadow = "shadow-hard";
  const actionShadow =
    "shadow-hard outline-none transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-hard-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-x-[4px] active:translate-y-[4px] active:shadow-none";

  return (
    <div className="min-h-[100dvh] bg-bg text-ink">
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-4 px-5 py-3 md:px-6">
          <div className="flex items-center gap-3">
            {result.business.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.business.logo_url}
                alt={result.business.name ?? "Logo bisnis"}
                className="h-9 w-auto max-w-[120px] object-contain"
              />
            ) : null}
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
              {`${result.business.name?.toUpperCase() ?? "PHOTOBOX"}`}
            </p>
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.15em]">Hasil Foto</p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[900px] flex-col gap-8 px-5 py-8 md:px-6 md:py-10">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-5xl uppercase leading-[0.9] tracking-tight md:text-6xl">
            Foto kamu siap!
          </h1>
          {expiry && (
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {`Link berlaku sampai ${expiry}. Unduh sekarang.`}
            </p>
          )}
          <ResultShareActions
            sharePath={`/r/${token}`}
            zipHref={
              photos.length > 0
                ? `/api/v1/public/results/${encodeURIComponent(token)}/zip`
                : null
            }
          />
        </div>

        {result.gif_url ? (
          <section className="flex flex-col gap-3">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em]">GIF Slideshow</p>
            <div className={`border-2 border-ink bg-surface p-3 ${cardShadow}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.gif_url}
                alt="GIF slideshow hasil foto"
                width={480}
                height={480}
                className="h-auto w-full"
              />
            </div>
            <a
              href={result.gif_download_url ?? result.gif_url}
              download="snapyos-slideshow.gif"
              className={`inline-flex w-fit items-center justify-center border-2 border-ink bg-accent px-5 py-3 font-mono text-sm font-bold uppercase tracking-tight ${actionShadow}`}
            >
              Unduh GIF
            </a>
          </section>
        ) : (
          <p className="border-2 border-dashed border-ink/40 bg-muted px-4 py-3 font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
            GIF belum tersedia
          </p>
        )}

        <section className="flex flex-col gap-4">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em]">Foto Berframe</p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
            {photos.map((p, i) => (
              <figure
                key={p.id}
                className={`flex flex-col gap-2 border-2 border-ink bg-surface p-2 ${cardShadow}`}
              >
                {/* Rasio foto bervariasi per template canvas (2:3, 1:1, dst.),
                    bukan 2:3 seragam: biarkan rasio asli via aspect-ratio auto. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url ?? ""} alt={`Foto ${i + 1}`} className="h-auto w-full" />
                <a
                  href={p.download_url ?? p.url ?? "#"}
                  download={`snapyos-${i + 1}.jpg`}
                  className={`inline-flex items-center justify-center border-2 border-ink bg-surface px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.1em] ${actionShadow}`}
                >
                  Unduh
                </a>
              </figure>
            ))}
          </div>
          {photos.length === 0 && (
            <p className="border-2 border-dashed border-ink/40 bg-muted px-4 py-3 font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
              Foto belum tersedia
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
