import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getResult } from "@/server/kiosk-sessions";

export const metadata: Metadata = {
  title: "Hasil Foto — SnapyOS",
};

type Props = { params: Promise<{ token: string }> };

/** GET /r/[token] — online result (docs/05 §5.13: GIF + foto berframe). */
export default async function ResultPage({ params }: Props) {
  const { token } = await params;

  let result: Awaited<ReturnType<typeof getResult>> | null = null;
  try {
    result = await getResult(token);
  } catch {
    result = null;
  }
  if (!result) notFound();

  return (
    <div className="min-h-[100dvh] bg-bg">
      <header className="border-b-2 border-ink bg-surface">
        <div className="mx-auto flex max-w-[900px] items-center justify-between px-6 py-4">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {`/// ${result.business.name?.toUpperCase() ?? "PHOTOBOX"}`}
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.15em]">Hasil Foto</p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[900px] flex-col gap-8 px-6 py-10">
        <h1 className="font-display text-5xl uppercase leading-[0.9] tracking-tight md:text-6xl">
          Foto kamu siap!
        </h1>

        {result.gif_url ? (
          <section className="flex flex-col gap-3">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em]">
              GIF Slideshow
            </p>
            <div className="border-2 border-ink bg-surface p-3 shadow-[4px_4px_0_0_#111111]">
              <Image
                src={result.gif_url}
                alt="GIF slideshow hasil foto"
                width={840}
                height={840}
                className="h-auto w-full"
                unoptimized
              />
            </div>
            <a
              href={result.gif_url}
              download="snapyos-slideshow.gif"
              className="inline-flex w-fit items-center justify-center border-2 border-ink bg-accent px-5 py-3 font-mono text-sm font-bold uppercase tracking-tight shadow-[4px_4px_0_0_#111111] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#111111] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
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
            {result.photos
              .filter((p) => p.url)
              .map((p, i) => (
                <figure key={p.id} className="flex flex-col gap-2 border-2 border-ink bg-surface p-2 shadow-[4px_4px_0_0_#111111]">
                  <Image
                    src={p.url ?? ""}
                    alt={`Foto ${i + 1}`}
                    width={720}
                    height={1080}
                    className="h-auto w-full"
                    unoptimized
                  />
                  <a
                    href={p.url ?? "#"}
                    download={`snapyos-${i + 1}.jpg`}
                    className="inline-flex items-center justify-center border-2 border-ink bg-surface px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.1em] hover:bg-accent"
                  >
                    Unduh
                  </a>
                </figure>
              ))}
          </div>
        </section>
      </main>
    </div>
  );
}
